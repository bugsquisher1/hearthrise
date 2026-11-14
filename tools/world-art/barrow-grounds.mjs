// ════════════════════════════════════════════════════════════════════════
// tools/world-art/barrow-grounds.mjs — THE FLOORS, WALLS AND PROPS OF THE SLAKE, THE PYRE FIELD AND KRELL'S HOLD
// (the ground half of import-barrow-2026-11-14.mjs, which runs it; lane/b-barrow-art-import).
//
//   slake  brief 22: the copper silt/reeds and river/mud pairs (wang16, native) and four kit props.
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
import { ALPHA_CUT } from '../../src/data/world/palette.js';
import PYRE_MAP from '../../src/data/grounds/pyre_field/map.js';
import HOLD_MAP from '../../src/data/grounds/krells_hold/map.js';

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
    const dirs = ['1-earth-cobble', '3-flagstone-cobble', '4-setts-flagstone', '5-planks-flagstone', '6-gravel-cobble', '7-gravel-flagstone'].map((d) => `${H}/${d}`);
    const metas = dirs.map(metaOf);
    const id8 = (t) => t.slice(0, 8);
    const grid = 'art/briefs/krells-hold-grid-2026-11-14.txt';
    writeGrid(grid, ['KRELL\'S HOLD\'S PAINT GRID (lane/b-barrow-art-import, 2026-11-14): src/data/grounds/krells_hold/map.js rows as they stand.',
      '. cobble, : the cart road\'s earth, f flagstone, s setts, = the Hall\'s boards, g gravel, # wall mass (no floor: the walls are',
      'laid over the paint by tools/world-art/barrow-grounds.mjs). Painted by port-pixellab.mjs paint from brief 29\'s six pairs.'], HOLD_MAP.rows);
    run('port-pixellab.mjs', ['paint', '--set', 'hold', '--id', 'krells_hold_ground', '--grid', abs(grid), '--tilesets', dirs.map(abs).join(','), '--use', metas.map((m) => id8(m.id)).join(','),
      '--legend', `.=${id8(metas[0].base_tile_ids.upper)},:=${id8(metas[0].base_tile_ids.lower)},f=${id8(metas[1].base_tile_ids.upper)},s=${id8(metas[2].base_tile_ids.upper)},==${id8(metas[3].base_tile_ids.upper)},g=${id8(metas[4].base_tile_ids.upper)}`,
      '--void', '#', '--void-fill', WALL_TOP, '--material', 'native']);
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
    prop('hold', 'kh_gatehouse', 'building', `${H}/gatehouse/kh_gatehouse-586d798e.png`, '586d798e');
    for (const [id, cls, sheet] of HOLD_PROPS) prop('hold', id, cls, `${G14}/30-hold-props/props/${id}.png`, sheet);
  };
  return parts;
}

/* raw name -> the kit's name (mr_: the March's river pieces), class */
const SLAKE_PROPS = Object.freeze([['mr_stake_net_post', 'sl_stake_net_post', 'wreck'], ['mr_rope_coil', 'sl_rope_coil', 'wreck'], ['mr_drowned_cart', 'sl_drowned_cart', 'fixture']]);
const PYRE_PROPS = Object.freeze([['pf_burnt_pyre', 'wreck'], ['pf_burnt_pyre_small', 'log'], ['pf_burnt_pyre_scatter', 'log'], ['ma_fire_rake', 'fixture'], ['ma_log_stack', 'wreck'], ['ma_ash_barrow', 'wreck'], ['ma_charred_stake', 'fixture']]);
const HOLD_PROPS = Object.freeze([
  ['kh_high_seat', 'fixture', 'c20648fa'], ['kh_lectern', 'fixture', 'c20648fa'], ['kh_hall_table', 'station', 'c20648fa'], ['kh_hall_table_runner', 'station', 'c20648fa'],
  ['kh_banner_stand', 'fixture', '3d9dadd3'], ['kh_colors_upside_down', 'fixture', '3d9dadd3'],
  ['kh_pell', 'fixture', '80ea6463'], ['kh_weapon_rack', 'wreck', '80ea6463'], ['kh_woodpile', 'wreck', '80ea6463'], ['kh_well', 'wreck', '80ea6463'],
  ['kh_coffin_open', 'fixture', 'c8de9701'], ['kh_chapel_bench', 'wreck', 'c8de9701'], ['kh_toll_box', 'barrel', 'c8de9701']]);

/** The Pyre Field's paint rows from its map rows (the header's rule). */
function pyreGrid(rows) {
  const h = rows.length, w = rows[0].length;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? '#' : rows[y][x]);
  const near = (x, y, r, test) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (test(at(x + dx, y + dy))) return true; return false; };
  return rows.map((row, y) => [...row].map((ch, x) => {
    if (ch === 'o') return 'C';
    if (ch === ':') return near(x, y, 1, (c) => c === '#' || c === 'o') ? 'A' : 'S';
    if (ch !== '#') return 'A';
    if (near(x, y, 2, (c) => c !== '#')) return 'W';
    return near(x, y, 4, (c) => c !== '#') ? 'G' : 'M';
  }).join(''));
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

/* ── the Hold's wall mass over its paint ── */
const WALL_TOP = '#17141a';
function holdWalls() {
  const file = join(ROOT, ART_DIR, 'hold', 'krells_hold_ground.png');
  const img = decodePNG(readFileSync(file));
  const rows = HOLD_MAP.rows, h = rows.length, w = rows[0].length;
  const wall = (x, y) => x < 0 || y < 0 || x >= w || y >= h || rows[y][x] === '#';
  const floor = (x, y) => !wall(x, y);
  const W = `${G14}/29-hold-tiles/walls`, W26 = `${G14}/26-hold-sample/walls`;
  const S = { plain: rd(`${W26}/kh_wall_plain_b.png`), loop: rd(`${W26}/kh_wall_arrow_loop.png`), torch: rd(`${W26}/kh_wall_torch_bracket.png`), buttress: rd(`${W}/kh_wall_buttress.png`),
    cracked: rd(`${W}/kh_wall_cracked.png`), left: rd(`${W}/kh_wall_end_left.png`), right: rd(`${W}/kh_wall_end_right.png`) };
  for (const [k, s] of Object.entries(S)) if (s.width !== T || s.height !== 60) throw new Error('wall slice ' + k + ' is ' + s.width + 'x' + s.height + ', not 32x60');
  const strip = rd(`${W}/kh_wallcap_strip-7e08f2e8.png`);
  const [sx0, , sx1] = boxOf([strip]);
  const top = WALL_TOP.match(/[0-9a-f]{2}/gi).map((v) => parseInt(v, 16));
  /* the cap a run of capstones shows from above, east-west: the plain slice's own cap rows (its first opaque row down to the face) */
  let capY = 0; while (!on(S.plain, 16, capY)) capY++;
  const CAP = 10;
  /* 1: every wall cell is the mass's dark top */
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (wall(x, y)) for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) img.data.set([top[0], top[1], top[2], 255], ((y * T + py) * img.width + x * T + px) * 4);
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
  sc.notes += ' The wall mass is laid over the paint by tools/world-art/barrow-grounds.mjs: ' + faces + ' face slices (brief 26 and 29\'s kept runs), capstones on the top\'s other edges, the top ' + WALL_TOP + '.';
  writeFileSync(jp, JSON.stringify(sc, null, 2) + '\n');
  console.log('  ✓ hold/krells_hold_ground: ' + faces + ' wall faces laid over the paint');
}
