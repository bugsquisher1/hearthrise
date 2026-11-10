#!/usr/bin/env node
// tools/world-art/import-town-2026-11-09.mjs — the art director's READY town list (brief 13, verdicts 2026-11-08 rounds 1 and 2)
// → art/world/<set>/ sources and sidecars. Pure and repeatable: every file it writes is a function of art/world-src/gen-2026-11-09b/.
//
//   node tools/world-art/import-town-2026-11-09.mjs          write the sources + sidecars
//   node tools/world-art/import-town-2026-11-09.mjs --check  write nothing; exit 1 when a file on disk differs
//
// WHAT IT IMPORTS (the free passes are the verdicts' own: nothing here is redrawn, no pixel is invented)
//   set `yard` (new, town only): the Training Yard kit (13 kept props, the sparring pad c1, the ward ring c4, the helm c4 and split c4
//     dummies), the reactions as a `hit` clip (quintain 0 4 3 4 0; the straw, helm and split dummies 0 1 2 1 0; the pell and both butts the
//     scripted 1 px shudder 0 1 2 3), the arms master (r2) and the gate sergeant (S idle), every crop at four growth stages, the watered-soil
//     overlays, and the raked sand ring (Y2 r3 snapped to #c49a5c, so it is a `native` pair).
//   in place (same id, same set, now an idle loop at 8 fps): `forge` (cottage), `candle` (mill), `havora_cook_cauldron`, `havora_bread_oven`.
//   set `cottage`: the house dummy's five stacked part layers (hd_circle, hd_base, hd_plates, hd_arms, hd_target), art only.
// CLASSES (the verdicts): ty_trough log, ty_bench bench, ty_ward_ring + ty_scorch decal, every other yard prop fixture.
// NOT IMPORTED: ty_rune_post (A1e waits for the art director's read of its edit), monster attack/death clips, hero flinches, Pyre/Slake art.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { decodePNG, encodePNG, createImage, blit, crop } from './png.mjs';
import { ROOT } from './build.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const SRC = 'art/world-src/gen-2026-11-09b';
const rd = (p) => decodePNG(readFileSync(join(ROOT, p)));
const rdj = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const ALPHA = 128;

/** The opaque box [x0, y0, x1, y1] (inclusive) of an image, or null. */
function box(im) {
  let x0 = im.width, y0 = im.height, x1 = -1, y1 = -1;
  for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) {
    if (im.data[(y * im.width + x) * 4 + 3] >= ALPHA) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}
const unionBox = (ims) => ims.map(box).filter(Boolean).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
const cut = (im, b) => crop(im, b[0], b[1], b[2] - b[0] + 1, b[3] - b[1] + 1);
/** The centre column of the lowest opaque row's contiguous span: where a post meets the floor. */
function footX(im) {
  const b = box(im);
  const y = b[3];
  let best = null, x = 0;
  while (x < im.width) {
    if (im.data[(y * im.width + x) * 4 + 3] < ALPHA) { x++; continue; }
    let e = x;
    while (e + 1 < im.width && im.data[(y * im.width + e + 1) * 4 + 3] >= ALPHA) e++;
    if (!best || e - x > best[1] - best[0]) best = [x, e];
    x = e + 1;
  }
  return (best[0] + best[1]) >> 1;
}
/** A copy of `im` shifted by (dx, dy), clipped to its own size. */
function shift(im, dx, dy) {
  const out = createImage(im.width, im.height);
  blit(out, im, 0, 0, im.width, im.height, dx, dy);
  return out;
}

const OUT = new Map();   // path -> Buffer | string
const put = (path, data) => OUT.set(path, data);
function sheetOf(rows, fw, fh) {
  const w = Math.max(...rows.map((r) => r.length)) * fw;
  const sheet = createImage(w, rows.length * fh);
  rows.forEach((r, y) => r.forEach((f, x) => blit(sheet, f, 0, 0, fw, fh, x * fw, y * fh)));
  return sheet;
}

/**
 * One sprite: `anims` = [{ name, fps, loop, frames: [img…] }] (one south row each), every frame the same size.
 * `fixed` pins the frame and anchor (a character); otherwise the frame is the union of every frame's art and the anchor
 * is the post's foot on frame 0.
 */
function sprite(set, id, o) {
  const all = o.anims.flatMap((a) => a.frames);
  const [fw, fh] = all[0] ? [all[0].width, all[0].height] : [0, 0];
  let frames = o.anims.map((a) => a.frames), w = fw, h = fh, anchor = o.anchor;
  if (!o.fixed) {
    const b = unionBox(all);
    frames = frames.map((r) => r.map((f) => cut(f, b)));
    w = b[2] - b[0] + 1; h = b[3] - b[1] + 1;
    const still = frames[0][0];
    anchor = anchor || [footX(still), box(still)[3]];
  }
  const sc = {
    id, class: o.cls, style: 's1', material: o.material, source: id + '.png', ...(o.fixed ? {} : { frame: [w, h] }),
    anchor_px: anchor, footprint: o.footprint || [1, 1], ...(o.overhang ? { overhang_px: o.overhang } : {}),
    ...(o.blend ? { blend: o.blend } : {}),
    anims: o.anims.map((a) => ({ name: a.name, fps: a.fps || 0, loop: !!a.loop, dirs: { s: a.frames.length } })),
    pixellab: o.pixellab, notes: o.notes,
  };
  put(`art/world/${set}/${id}.png`, encodePNG(sheetOf(frames, w, h)));
  put(`art/world/${set}/${id}.json`, JSON.stringify(sc, null, 2) + '\n');
}

const still = (im) => [{ name: 'idle', fps: 0, loop: false, frames: [im] }];
const hit = (frames, fps = 12) => ({ name: 'hit', fps, loop: false, frames });
/* the footprint is the ground a prop's width covers: wider than 1.5 tiles takes two */
const wide = (im) => [box(im)[2] - box(im)[0] + 1 > 48 ? 2 : 1, 1];

/* ── THE TRAINING YARD ───────────────────────────────────────────────────── */
const Y1 = `${SRC}/y1-yard-kit`;
const SHEET1 = 'b008f4cb-1c08-565e-b215-8ef1232fa0f0', SHEET2 = '32c9ce4e-2dfb-4010-a649-b46eb509d519', RETRY = '06ca96be-a89c-49de-96c6-69058049c017';
const GEN = 'PixelLab create_image_pro_flash, brief 13 Y1 (art/world-src/gen-2026-11-09b/y1-yard-kit), style 1; cut by blob, no pixel redrawn';
const lab = (image, tool = GEN) => ({ tool, image });
function yard() {
  const cell = (n) => rd(`${Y1}/cells/${n}.png`);
  const props = [
    ['ty_arrow_stand', cell('ty_arrow_stand'), 'fixture', 'wood', 'a barrel of fletched arrows beside the archery lane'],
    ['ty_banner', cell('ty_banner'), 'fixture', 'wood', 'the town banner on a post (E1\'s look: the red banner with the cream flame)'],
    ['ty_bench', cell('ty_bench'), 'bench', 'wood', 'a low plank bench for the yard'],
    ['ty_range_marker', cell('ty_range_marker'), 'fixture', 'wood', 'a striped range post; grass survives at its foot where boots do not reach'],
    ['ty_rune_lectern', cell('ty_rune_lectern'), 'fixture', 'stone', 'a stone lectern with an open spell book, the magic corner\'s centre'],
    ['ty_sword_rack', cell('ty_sword_rack'), 'fixture', 'wood', 'a rack of blunt steel training blades'],
    ['ty_trough', cell('ty_trough'), 'log', 'wood', 'a water trough (class log: 52x24 is over bulky\'s 40 wide)'],
    ['ty_sparring_pad', rd(`${Y1}/cells2/ty_sparring_board-c1.png`), 'fixture', 'wood', 'a dark quilted leather sparring pad on two posts (sheet 2 c1; sheet 1\'s pale board read as a notice board)'],
  ];
  for (const [id, im, cls, material, note] of props) {
    sprite('yard', id, { cls, material, anims: still(im), footprint: wide(im), pixellab: lab(id === 'ty_sparring_pad' ? SHEET2 : SHEET1), notes: `${note}. Brief 13 verdicts 2026-11-08.` });
  }
  /* decals: the ward ring (sheet 2 c4: flush flagstones cut with chalked runes) and the scorch */
  sprite('yard', 'ty_ward_ring', { cls: 'decal', material: 'stone', anims: still(rd(`${Y1}/cells2/ty_ward_ring-c4.png`)), pixellab: lab(SHEET2, GEN + ' sheet 2 c4'),
    notes: 'A ring of flush flagstones, each cut with a chalked rune: the magic corner\'s floor. Class decal (verdict).' });
  sprite('yard', 'ty_scorch', { cls: 'decal', material: 'stone', anims: still(cell('ty_scorch')), pixellab: lab(SHEET1), notes: 'A scorch mark on the dirt where a spell landed. Class decal (verdict).' });

  /* the targets and their reactions */
  const B1 = `${SRC}/b1-reactions`;
  const lay = (dir, order) => order.map((i) => rd(`${dir}/frame_00${i}.png`));
  const quintain = rdj(`${B1}/ty_quintain/lay.json`);
  sprite('yard', 'ty_quintain', { cls: 'fixture', material: 'wood', footprint: [2, 1], pixellab: lab('840ee2bb-5aeb-439d-a9ae-60fe06b63158', GEN + ' + animate_image (B1)'),
    anims: [...still(lay(`${B1}/ty_quintain/cut`, [0])[0]), hit(lay(`${B1}/ty_quintain/cut`, quintain.order))],
    notes: 'The quintain: the crossarm swings, the shield lifts and the sandbag squashes round (laid 0 4 3 4 0 at 12 fps as the verdict ruled). Its `hit` clip answers a blow.' });
  const JOBS = { ty_pell: '20113e4f-04bd-4788-b87f-daf188216637', ty_archery_butt: 'cb6949f2-1fa5-499f-ac9c-9690acdc5ea5', ty_butt_small: '0522afa4-0ea5-45a0-810b-2123ef7edc9d',
    ty_straw_dummy: 'a04fc928-1e95-40b9-86c4-c2f6beb2c017', ty_straw_dummy_helm: 'b1ba6742', ty_straw_dummy_split: '96b53a06' };
  for (const [id, dir, cls, label] of [['ty_pell', 'ty_pell', 'fixture', 'The pell'], ['ty_archery_butt', 'ty_archery_butt', 'fixture', 'The archery butt, facing south'], ['ty_butt_small', 'ty_butt_small', 'fixture', 'The small butt']]) {
    const f = lay(`${B1}/${dir}/shudder`, [0, 1, 2, 3]);
    sprite('yard', id, { cls, material: 'wood', footprint: wide(f[0]), pixellab: lab(JOBS[id]),
      anims: [...still(f[0]), hit(f)],
      notes: `${label}. Its \`hit\` clip is the free 1 px shudder of the verdict: the rows above the cut's freeze row move 1 art px right, then 1 px left (0 r l 0 at 12 fps); the base never moves.` });
  }
  const dummies = [
    ['ty_straw_dummy', rd(`${SRC}/y4-reactions/ty_straw_dummy/laid/south/frame_000.png`), [0, 1, 2, 3, 4].map((i) => rd(`${SRC}/y4-reactions/ty_straw_dummy/laid/south/frame_00${i}.png`)), 'The straw dummy with its buckler.'],
    ['ty_straw_dummy_helm', null, [0, 1, 2, 3, 4].map((i) => rd(`${B1}/ty_straw_dummy_helm/laid/frame_00${i}.png`)), 'The helmed variant (retry c4): it reads as another dummy, not a small one.'],
    ['ty_straw_dummy_split', null, [0, 1, 2, 3, 4].map((i) => rd(`${B1}/ty_straw_dummy_split/laid/frame_00${i}.png`)), 'The split-straw variant (retry c4): the rope reads.'],
  ];
  for (const [id, , frames, label] of dummies) {
    sprite('yard', id, { cls: 'fixture', material: 'wood', pixellab: lab(JOBS[id], GEN + ' + animate_image (Y4/B1v)'), anims: [...still(frames[0]), hit(frames)],
      notes: `${label} The \`hit\` clip is laid 0 1 2 1 0 at 12 fps (a drawn lean beats a sliding recoil: the post stays planted).` });
  }
}

/* ── THE ARMS MASTER AND THE GATE SERGEANT (placed town folk: the S idle) ─── */
function npc(id, object, dir, order, note) {
  const stillImg = rd(`${dir}/south.png`);
  const bottom = box(stillImg)[3];
  const seat = (im) => { const f = createImage(64, 64); blit(f, im, 0, 0, im.width, im.height, 8, 58 - bottom); return f; };
  const frames = order.map((i) => seat(rd(`${dir}/idle/south/frame_00${i}.png`)));
  sprite('yard', id, { cls: 'character', material: 'unit', fixed: true, anchor: [32, 58], pixellab: { tool: 'create_object_pro_flash 8 directions 48x48 + animate_object v3 (brief 13)', object },
    anims: [{ name: 'idle', fps: 5, loop: true, frames }], notes: note });
}

/* ── THE FLAMES (in place) ────────────────────────────────────────────────── */
function flame(set, id, srcDir, order, fps, padded, still0) {
  const sidecar = rdj(`art/world/${set}/${id}.json`);
  const [fw, fh] = sidecar.frame;
  const frames = order.map((i) => crop(rd(`${srcDir}/frame_00${i}.png`), padded[0], padded[1], fw, fh));
  /* the sheet's first frame (the shipped still, or on a re-run the loop's own frame 0: the import is idempotent) */
  const base = crop(decodePNG(readFileSync(join(ROOT, `art/world/${set}/${id}.png`))), 0, 0, fw, fh);
  /* frame 0 is the shipped sprite: every opaque pixel agrees (what sits under a transparent pixel is nothing) */
  let off = 0;
  for (let i = 0; i < base.data.length; i += 4) {
    const a = base.data[i + 3] >= ALPHA, b = frames[0].data[i + 3] >= ALPHA;
    if (a !== b || (a && (base.data[i] !== frames[0].data[i] || base.data[i + 1] !== frames[0].data[i + 1] || base.data[i + 2] !== frames[0].data[i + 2]))) off++;
  }
  if (off && !still0) throw new Error(`${id}: frame 0 differs from the shipped sprite in ${off} px`);
  sidecar.anims = [{ name: 'idle', fps, loop: true, dirs: { s: frames.length } }];
  sidecar.notes = (sidecar.notes || '').replace(/ Flame loop:.*$/, '') + ` Flame loop: the still with only its warm flame pixels moving (brief 13 L1 cut, verdict laid ${order.join(' ')} at ${fps} fps), imported in place.`;
  put(`art/world/${set}/${id}.png`, encodePNG(sheetOf([frames], fw, fh)));
  put(`art/world/${set}/${id}.json`, JSON.stringify(sidecar, null, 2) + '\n');
}

/* ── THE FARM ──────────────────────────────────────────────────────────── */
const CROPS = ['turnip', 'carrot', 'wheat', 'potato', 'tomato', 'pumpkin', 'goldenroot', 'emberfruit', 'moonbloom'];
const STAGES = ['sprout', 'young', 'ripening', 'ripe'];
function cropCells() {
  const out = {};
  const sheet1 = rd('art/world-src/gen-2026-11-09/c1-crop-beds-sample/sheet1.png');
  const blobs = (im) => {
    /* the cell's art: its opaque box, as cut */
    const b = box(im);
    return cut(im, b);
  };
  ['turnip', 'carrot', 'wheat', 'potato'].forEach((c, r) => STAGES.forEach((s, k) => { out[`${c}_${k}`] = blobs(crop(sheet1, k * 32, r * 32, 32, 32)); }));
  const S2 = `${SRC}/q11-crop-beds-sheet2`;
  for (const c of ['tomato', 'pumpkin', 'goldenroot', 'emberfruit']) {
    STAGES.forEach((s, k) => {
      const f = c === 'pumpkin' && s === 'ripe' ? `${S2}/trimmed/pumpkin-ripe.png` : `${S2}/cells/${c}-${s}.png`;
      out[`${c}_${k}`] = rd(f);
    });
  }
  /* sheet 3: goldenroot ripening c2 and emberfruit ripening c1 replace sheet 2's gold/orange ripening, which gave ripeness away */
  const S3 = `${SRC}/b11-crop-beds-sheet3/cells`;
  out.goldenroot_2 = rd(`${S3}/goldenroot-ripening-c2.png`);
  out.emberfruit_2 = rd(`${S3}/emberfruit-ripening-c1.png`);
  STAGES.forEach((s, k) => { out[`moonbloom_${k}`] = rd(`${S3}/moonbloom-${s}.png`); });
  return out;
}
const CROP_JOB = { turnip: '3dcd99f2', carrot: '3dcd99f2', wheat: '3dcd99f2', potato: '3dcd99f2', tomato: '12c2816d-7274-407d-81b5-735a40606553', pumpkin: '12c2816d-7274-407d-81b5-735a40606553',
  goldenroot: '12c2816d-7274-407d-81b5-735a40606553', emberfruit: '12c2816d-7274-407d-81b5-735a40606553', moonbloom: '24aae9d1-febb-4f6e-82c8-f0a107412635' };
function farm() {
  const cells = cropCells();
  /* every stage of a crop shares its footprint on the soil: the cell is the art's own box, seated bottom-centre on its tile */
  for (const c of CROPS) {
    STAGES.forEach((s, k) => {
      const im = cells[`${c}_${k}`];
      const b = box(im);
      sprite('yard', `crop_${c}_${k}`, { cls: 'decal', material: 'wood', anims: still(cut(im, b)), anchor: [(b[2] - b[0] + 1) >> 1, b[3] - b[1]],
        pixellab: { tool: 'create_image_pro_flash 4x4 sheet of 32 px cells (brief 11 C1 / brief 13 Q11, B11), style: the cabbage crate', image: CROP_JOB[c] },
        notes: `${c}, stage ${k} (${s}) of 0-3: a plant alone on a plot tile, no soil drawn. The town draws the stage the server's plot data names (src/world/town-farm.js).` });
    });
  }
  const S3 = `${SRC}/b11-crop-beds-sheet3/cells`;
  for (let n = 1; n <= 4; n++) {
    const im = rd(`${S3}/watered-${n}.png`);
    const b = box(im);
    sprite('yard', `crop_watered_${n}`, { cls: 'decal', material: 'terrain', anims: still(cut(im, b)), anchor: [(b[2] - b[0] + 1) >> 1, b[3] - b[1]],
      pixellab: { tool: 'create_image_pro_flash 128x96 sheet (brief 13 B11)', image: '24aae9d1-febb-4f6e-82c8-f0a107412635' }, notes: 'A watered-soil overlay (damp earth on transparency). Imported as art only: the server\'s plot data carries no watered flag yet, so no scene places it.' });
  }
}

/* ── THE SAND RING (terrain) ──────────────────────────────────────────── */
function sand() {
  const dir = `${SRC}/y2-sand-ring`;
  const sheetIm = rd(`${dir}/snapped/r3-0edd6ad0-sheet-locked-snapped.png`);
  const meta = rdj(`${dir}/r3-0edd6ad0-metadata.json`);
  const list = meta.tileset_data.tiles;
  const tiles = {};
  const sheet = createImage(8 * 32, 2 * 32);
  /* Wang-16 key NW NE SW SE, '1' = the upper material (sand); the sheet's two rows of eight, ordered by key like every other pair */
  const keys = Array.from({ length: 16 }, (_, i) => i.toString(2).padStart(4, '0'));
  keys.forEach((k, n) => {
    const t = list.find((e) => ['NW', 'NE', 'SW', 'SE'].map((c) => (e.corners[c] === 'upper' ? '1' : '0')).join('') === k);
    if (!t) throw new Error('sand: no tile for ' + k);
    const bb = t.bounding_box;
    blit(sheet, sheetIm, bb.x, bb.y, 32, 32, (n % 8) * 32, (n >> 3) * 32);
    tiles[k] = [[n % 8, n >> 3]];
  });
  const sc = { id: 'havora_earth_sand', class: 'terrain', kind: 'wang16', style: 's1', material: 'native', source: 'havora_earth_sand.png', lower: 'earth', upper: 'sand', tiles,
    pixellab: { tool: 'create_topdown_tileset pro, 32 px (brief 13 Y2 r3), locked to the terrain grade then SNAPPED at import', tileset: '0edd6ad0-2b4c-471c-9c7a-638678a5adf3', lower_base_tile_id: '97e71544-5fcf-4e48-94b7-c809721a12be' },
    notes: 'Raked training sand on the town dirt. Y2 r3 locked (terrain), then a 4-connected flood fill seeded on the #dcae86 rake pixels through #a88457 and #dcae86 moves every #a88457 inside it to #c49a5c (6,799 px: one value step lighter than the dirt, bounded by the dark rim line). The dirt side stays byte-identical to the locked town dirt. `native` because the pixels are already on the palette.' };
  put('art/world/yard/havora_earth_sand.png', encodePNG(sheet));
  put('art/world/yard/havora_earth_sand.json', JSON.stringify(sc, null, 2) + '\n');
}

/* ── THE HOUSE DUMMY (art only) ───────────────────────────────────────── */
function houseDummy() {
  const dir = `${SRC}/y5-house-dummy/parts/top`;
  const names = ['hd_circle', 'hd_base', 'hd_plates', 'hd_arms', 'hd_target'];
  const ims = names.map((n) => rd(`${dir}/${n}.png`));
  const b = unionBox(ims);
  /* one frame for all five (they stack at the same anchor); the foot is the plinth's lowest row (the ring lies round it, below) */
  const base = ims[1];
  const foot = box(base)[3] - b[1];
  const cx = footX(base) - b[0];
  const ring = box(ims[0])[3] - b[1] - foot;
  names.forEach((n, i) => {
    const f = cut(ims[i], b);
    const ringOnly = i === 0;
    sprite('cottage', n, { cls: ringOnly ? 'decal' : i === 1 ? 'fixture' : 'part', material: i === 0 ? 'stone' : 'wood', fixed: true, anchor: [cx, foot], overhang: ringOnly ? [0, 0, ring, 0] : undefined,
      anims: still(f), footprint: [2, 1], pixellab: { tool: 'create_object_pro_flash 64x64 (Y5 c2), parts by inpaint_image (B2)', object: '64e2a71d-d95d-4f79-80d3-66aa04b4c1ca' },
      notes: 'A layer of the gilded house training dummy (brief 13 Y5 c2, B2): circle, base, plates, arms, target stack in that draw order at one anchor. Art only; the house dummy system (prices, unlocks) is a later designer lane and no map places it.' });
  });
  void b;
}

function build() {
  OUT.clear();
  yard();
  const Y3 = `${SRC}/y3-npc_arms_master/r2`;
  npc('npc_arms_master', 'eb44b804-cfb1-4c1d-9d96-da29ca12dfc1', Y3, [0, 1, 2, 1], 'The arms master (r2): a grizzled trainer in a quilted gambeson with a blunt steel practice sword planted point-down, both hands on the pommel. S idle laid 0 1 2 1 at 5 fps.');
  npc('npc_gate_sergeant', 'ccd33d70-ee8a-48f6-a0bc-c6545d3b5f5a', `${SRC}/q10-npc_gate_sergeant/npc_gate_sergeant`, [0, 1, 2, 1], 'The gate sergeant: a stout older sergeant with a grey beard, a steel cap and a dark red tabard with a cream flame over mail, a halberd held upright. S idle laid 0 1 2 1 at 5 fps (frames 3-8 drift the right arm and grow a spike on the cap).');
  const Q2 = `${SRC}/q2-flames-sample`, B4 = `${SRC}/b4-flames`;
  flame('cottage', 'forge', `${Q2}/forge/cut`, [0, 1, 2, 6, 7, 8], 8, [0, 0]);
  flame('mill', 'candle', `${Q2}/candle/cut-island`, [0, 1, 2, 3, 4, 5, 6, 7, 8], 8, [0, 0]);
  flame('havora', 'havora_cook_cauldron', `${B4}/havora_cook_cauldron/cut`, [0, 1, 2, 1], 8, [0, 0]);
  flame('havora', 'havora_bread_oven', `${B4}/havora_bread_oven/cut`, [0, 6, 7, 8, 7, 6], 8, [0, 0]);
  farm();
  sand();
  houseDummy();
  return OUT;
}

if (isMain(import.meta.url)) {
  const check = process.argv.includes('--check');
  const files = build();
  let drift = 0;
  for (const [p, data] of files) {
    const abs = join(ROOT, p);
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (check) { if (!existsSync(abs) || Buffer.compare(readFileSync(abs), buf) !== 0) { console.error('drift: ' + p); drift++; } continue; }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, buf);
  }
  console.log(check ? (drift ? `import-town: ${drift} file(s) drift` : `import-town: green, ${files.size} files match their sources`) : `import-town: wrote ${files.size} files`);
  process.exit(drift ? 1 : 0);
}
