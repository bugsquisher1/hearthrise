#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/tower-window-art.mjs — THE BURNING TOWER WINDOW'S PIECES (lane/b-tower-window, direction A "The Chimney", Tyler 2026-11-16).
//
// The window draws the Tower as the Great Hearth's own chimney, climbing, and the Chest tab as the hearth's firebox with the chest on its
// ledge BESIDE the fire (Tyler on mock A: "The chest should be off to the side of the hearth on the ledge a bit so it doesn't block the
// flame"). Every piece is cut from the shipped world art or scripted in palette entries (art/world/palette.json hr-world-56-v2, read by
// palette.mjs: no colour is written here as a literal), binary alpha, nothing scaled: the window lays them at x2 (ART_DIRECTION §2).
//
//   assets/ui/tower/chimney.png    ONE COURSE of the chimney's straight stack (great_hearth.png, COURSE), repeated up the Climb tab's tower
//   assets/ui/tower/landings.png   A LANDING every 10th floor: an iron band across the stack with its key's lock plate in the key's metal
//                                  (tower-art.mjs METALS), one row a key in src/data/chests.js CHEST_KEYS order, then a plain band (the
//                                  tower's foot, floor 1, and any key row with no metal): LANDING_W x LANDING_H each
//   assets/ui/tower/chimney-narrow.png, landings-narrow.png   the same for the phone's sheet: the stack's middle courses (COURSE_NARROW)
//                                  and bands LANDING_W_NARROW wide
//   assets/ui/tower/ticks.png      a floor's tick right of the stack: lit (gold, cleared) and dark, TICK_W x TICK_H each
//   assets/ui/tower/embers.png     an opening left this week: a live ember and a spent one (the Chest tab's Opens left), EMBER x EMBER each
//   assets/ui/tower/heads.png      a hero's head for the tower's markers: the idle south frame's head of each outfit (atlas-heroes),
//                                  HEAD_W x HEAD_H each, in src/data/hunt-outfits.js OUTFITS order
//   assets/ui/tower/firebox.png    THE CHEST TAB's scene: the Great Hearth's firebox, the paving in front and the alcoves (FIREBOX)
//   assets/ui/tower/fire.png       the hearth's own fire loop over it (art/world/common/hearth_fire.png, 8 frames), at FIRE_AT in the scene
//   assets/ui/tower/chest.png      the chest ON THE LEDGE beside the fire, where the town map puts it (sites.js AMBIENT, chestFoot: the
//                                  hearth frame's px): tower-art.mjs's idle loop (24 frames: the fire's light, the glint, the seam's breath), at CHEST_AT
//   assets/ui/tower/chest-glow.png, chest-smoke.png   its green light on the stone (laid additively) and its smoke, the town's own loops,
//                                  on the chest's foot (GLOW_AT, SMOKE_AT)
// The reveal strips (assets/ui/tower/chest-open-*, chest-column-*: tower-art.mjs) play at REVEAL_AT, where the chest sits.
//
//   node tools/world-art/tower-window-art.mjs           write them
//   node tools/world-art/tower-window-art.mjs --check   exit 1 when a written file differs from a fresh drawing
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImage, encodePNG, decodePNG, crop, blit } from './png.mjs';
import { RAMPS } from './palette.mjs';
import { METALS, drawChestIdle, drawGlow, drawSmoke, FW, FH, ANCHOR, GLOW_ANCHOR, SMOKE_ANCHOR, GW, GH, SW, SH, ITEM_AT } from './tower-art.mjs';
import { CHEST_KEYS } from '../../src/data/chests.js';
import { OUTFITS } from '../../src/data/hunt-outfits.js';
import { TOWER_ART } from '../../src/data/tower-art.js';
import { SCENERY, AMBIENT } from '../../src/data/world/town/sites.js';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => decodePNG(readFileSync(join(ROOT, rel)));
const HEARTH = 'art/world/common/great_hearth.png';
const R = (ramp, i) => RAMPS[ramp][i];
const C = Object.freeze({ K: R('shadow', 0), gold: R('gold', 0), dark: R('iron', 1), i1: R('iron', 1), i2: R('iron', 2), i3: R('iron', 3) });
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function fill(img, x, y, w, h, hex) {
  const [r, g, b] = rgb(hex);
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    if (xx < 0 || yy < 0 || xx >= img.width || yy >= img.height) continue;
    img.data.set([r, g, b, 255], (yy * img.width + xx) * 4);
  }
}

const { COURSE, COURSE_NARROW, LANDING_W, LANDING_W_NARROW, LANDING_H, TICK_W, TICK_H, EMBER, HEAD_W, HEAD_H, FIREBOX, FIRE_AT, CHEST_AT, GLOW_AT, SMOKE_AT, REVEAL_AT } = TOWER_ART;

/** One course of the chimney's stack, cut from the Great Hearth (its straight top: the same stones the town shows). */
export const drawChimney = (c = COURSE) => crop(read(HEARTH), c.x, c.y, c.w, c.h);

/* A landing's band and plate, LANDING_W x LANDING_H, the band's rows 1..6 (dark edge, lit top, two mid, a shade, dark edge), the plate a
   7 x 9 lock in the key's metal (light top and left, dark right and foot, a keyhole), or no plate for the foot. */
function landing(img, top, metal, W) {
  fill(img, 0, top + 1, W, 6, C.K);
  fill(img, 1, top + 2, W - 2, 1, C.i3);
  fill(img, 1, top + 3, W - 2, 2, C.i2);
  fill(img, 1, top + 5, W - 2, 1, C.i1);
  if (!metal) return;
  const [dk, mid, lt] = metal, px = Math.floor(W / 2) - 3;
  fill(img, px, top, 7, 9, C.K);
  fill(img, px + 1, top + 1, 5, 7, mid);
  fill(img, px + 1, top + 1, 4, 1, lt);
  fill(img, px + 1, top + 2, 1, 5, lt);
  fill(img, px + 5, top + 2, 1, 6, dk);
  fill(img, px + 1, top + 7, 5, 1, dk);
  fill(img, px + 3, top + 3, 1, 3, C.K);
}
/** Every landing: one row a key (CHEST_KEYS order), then the plain band. */
export function drawLandings(W = LANDING_W) {
  const rows = CHEST_KEYS.map((k) => METALS[k.id]).concat([null]);
  const img = createImage(W, LANDING_H * rows.length);
  rows.forEach((m, i) => landing(img, i * LANDING_H, m, W));
  return img;
}

/** A floor's tick, lit and dark: a dark box with a 2 x 1 light. */
export function drawTicks() {
  const img = createImage(TICK_W * 2, TICK_H);
  [C.gold, C.dark].forEach((c, i) => { fill(img, i * TICK_W, 0, TICK_W, TICK_H, C.K); fill(img, i * TICK_W + 1, 1, TICK_W - 2, TICK_H - 2, c); });
  return img;
}

/* An ember, 8 x 8: rings of value from its rim to its heart; live on the fire ramp, spent on the ash. */
const EMBER_ROWS = Object.freeze(['..0000..', '.011110.', '01122110', '01233210', '01233210', '01122110', '.011110.', '..0000..']);
/** The two embers: live (shadow, blood, torch, torch light) and spent (shadow, shadow, stone, stone). */
export function drawEmbers() {
  const img = createImage(EMBER * 2, EMBER);
  [[C.K, R('blood', 0), R('torch', 0), R('torch', 1)], [C.K, R('shadow', 2), R('stone', 0), R('stone', 1)]].forEach((ramp, i) => {
    EMBER_ROWS.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') fill(img, i * EMBER + x, y, 1, 1, ramp[+ch]); }));
  });
  return img;
}

/** Each outfit's head from its idle south frame (the atlas the world draws heroes from), in OUTFITS order. */
export function drawHeads() {
  const atlas = read('assets/world/atlas-heroes.png');
  const meta = JSON.parse(readFileSync(join(ROOT, 'assets/world/atlas-heroes.json'), 'utf8'));
  const ids = Object.values(OUTFITS);
  const img = createImage(HEAD_W * ids.length, HEAD_H);
  ids.forEach((id, i) => {
    const s = meta.sprites[id];
    if (!s) throw new Error('no hero sprite ' + id + ' in atlas-heroes');
    const [fx, fy] = s.anims.idle.dirs.s[0];
    blit(img, atlas, fx + Math.floor(s.frame[0] / 2) - Math.floor(HEAD_W / 2), fy + TOWER_ART.HEAD_TOP, HEAD_W, HEAD_H, i * HEAD_W, 0);
  });
  return img;
}

/** The Chest tab's scene: the Great Hearth's firebox and the paving in front of it. */
export const drawFirebox = () => crop(read(HEARTH), FIREBOX.x, FIREBOX.y, FIREBOX.w, FIREBOX.h);

/** Every file this tool writes: path -> PNG bytes. */
export function drawAll() {
  const out = new Map();
  out.set('assets/ui/tower/chimney.png', encodePNG(drawChimney()));
  out.set('assets/ui/tower/landings.png', encodePNG(drawLandings()));
  out.set('assets/ui/tower/chimney-narrow.png', encodePNG(drawChimney(COURSE_NARROW)));
  out.set('assets/ui/tower/landings-narrow.png', encodePNG(drawLandings(LANDING_W_NARROW)));
  out.set('assets/ui/tower/ticks.png', encodePNG(drawTicks()));
  out.set('assets/ui/tower/embers.png', encodePNG(drawEmbers()));
  out.set('assets/ui/tower/heads.png', encodePNG(drawHeads()));
  out.set('assets/ui/tower/firebox.png', encodePNG(drawFirebox()));
  out.set('assets/ui/tower/fire.png', encodePNG(read('art/world/common/hearth_fire.png')));
  out.set('assets/ui/tower/chest.png', encodePNG(drawChestIdle()));
  /* the idle rows of the town's light and smoke (row 0 of each sheet) */
  out.set('assets/ui/tower/chest-glow.png', encodePNG(crop(drawGlow(), 0, 0, CHEST_AT.frames * GW, GH)));
  out.set('assets/ui/tower/chest-smoke.png', encodePNG(crop(drawSmoke(), 0, 0, CHEST_AT.frames * SW, SH)));
  return out;
}

/* THE CHEST'S FOOT IN THE HEARTH'S FRAME, from the town's own rows (src/data/world/town/sites.js: the Hearth's SCENERY row and the chest's
   AMBIENT row, compose.js's anchor rule), so the window's chest stands where the town's does wherever it is seated */
export function chestFoot() {
  const T = 32, hearth = JSON.parse(readFileSync(join(ROOT, 'art/world/common/great_hearth.json'), 'utf8'));
  const [, hx, hy] = SCENERY.find((r) => r[0] === 'great_hearth');
  const a = AMBIENT.find((r) => r.id === 'hearth_chest');
  const [fw, fh] = hearth.footprint, [ax, ay] = hearth.anchor_px;
  /* the Hearth's frame's top-left in world px: its anchor at its footprint's bottom middle */
  const left = (hx + fw / 2) * T - ax, top = (hy + fh) * T - 1 - ay;
  return { x: Math.round((a.x + 0.5) * T + (a.dx || 0)) - left, y: (a.y + 1) * T - 1 - (a.lift || 0) - top };
}

/* Where the pieces sit agrees with the art they came from: the chest's foot is the town map's, the fire's top-left the hearth's sidecar's,
   and the reveal's frame lays the open chest's box exactly over the shut chest's. */
function placement() {
  const errs = [];
  const fire = JSON.parse(readFileSync(join(ROOT, 'art/world/common/hearth_fire.json'), 'utf8'));
  const chest = JSON.parse(readFileSync(join(ROOT, 'art/world/townlife/hearth_chest.json'), 'utf8'));
  const foot = chestFoot();
  if (FIRE_AT.x + FIREBOX.x !== 146 || FIRE_AT.y + FIREBOX.y !== 238 || fire.frame[0] !== FIRE_AT.w || fire.frame[1] !== FIRE_AT.h)
    errs.push('the fire is not at the hearth frame\'s px (146, 238), 61 x 49 (great_hearth.json notes)');
  if (CHEST_AT.x + chest.anchor_px[0] + FIREBOX.x !== foot.x || CHEST_AT.y + chest.anchor_px[1] + FIREBOX.y !== foot.y || chest.frame[0] !== CHEST_AT.w || chest.frame[1] !== CHEST_AT.h)
    errs.push('the chest is not on the ledge where the town map puts it, the hearth frame\'s px (' + foot.x + ', ' + foot.y + ') (sites.js AMBIENT)');
  const idle = chest.anims.find((a) => a.name === 'idle');
  if (idle.dirs.s !== CHEST_AT.frames || idle.fps !== CHEST_AT.fps) errs.push('the window\'s chest does not loop as the town\'s (CHEST_AT frames, fps)');
  /* its light and its smoke stand on its foot, as in town */
  for (const [name, at, [ax, ay], w, h] of [['light', GLOW_AT, GLOW_ANCHOR, GW, GH], ['smoke', SMOKE_AT, SMOKE_ANCHOR, SW, SH]])
    if (at.x + ax !== CHEST_AT.x + ANCHOR[0] || at.y + ay !== CHEST_AT.y + ANCHOR[1] || at.w !== w || at.h !== h) errs.push('the chest\'s ' + name + ' is not on its foot');
  if (CHEST_AT.x < FIRE_AT.x + FIRE_AT.w - 10 && CHEST_AT.x + CHEST_AT.w > FIRE_AT.x + 10) errs.push('the chest covers the fire');
  const P = TOWER_ART.PHONE_VIEW;
  if (CHEST_AT.x < P.x || CHEST_AT.x + CHEST_AT.w > P.x + P.w || FIRE_AT.x < P.x || FIRE_AT.x + FIRE_AT.w > P.x + P.w || P.x + P.w > FIREBOX.w)
    errs.push('the phone\'s view cuts through the chest or the fire, or runs past the scene');
  if (REVEAL_AT.x + Math.floor((FW - CHEST_AT.w) / 2) !== CHEST_AT.x || REVEAL_AT.y + FH - 1 - CHEST_AT.h !== CHEST_AT.y || REVEAL_AT.w !== FW || REVEAL_AT.h !== FH)
    errs.push('the reveal does not play where the chest sits');
  if (TOWER_ART.ITEM_AT.x !== ITEM_AT.x || TOWER_ART.ITEM_AT.y !== ITEM_AT.y) errs.push('the found item does not rise from the open chest\'s mouth (ITEM_AT)');
  return errs;
}

function main(argv) {
  const check = argv.includes('--check');
  const errs = placement();
  for (const e of errs) console.error('tower-window-art: ' + e);
  let stale = 0;
  for (const [rel, png] of drawAll()) {
    const file = join(ROOT, rel);
    if (check) { let cur = null; try { cur = readFileSync(file); } catch { /* missing */ } if (!cur || !cur.equals(png)) { console.error('stale: ' + rel); stale++; } }
    else { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, png); console.log('wrote ' + rel); }
  }
  if (check) console.log(stale || errs.length ? 'tower-window-art --check: ' + stale + ' stale, ' + errs.length + ' misplaced' : 'tower-window-art --check: fresh');
  return stale || errs.length ? 1 : 0;
}

if (isMain(import.meta.url)) { try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error('tower-window-art: ' + (e && e.stack || e)); process.exit(2); } }
