#!/usr/bin/env node
// tools/world-art/derive-combat.mjs — a unit's OWN idle frames → its blow, its fall and its corpse.
//
//   node tools/world-art/derive-combat.mjs            write the clips into art/world/<set>/<id>.{png,json}
//   node tools/world-art/derive-combat.mjs --check    exit 1 when a source is not what a re-run would write
//
// The hunt renders a kill as the clip `death` and then the held `corpse` (src/world/choreo.js), a
// swing as `attack`. A monster ported with only an idle rotation and a walk (the Mill Cellar's three,
// the Sewer's six) has none of them, so a kill left whatever the renderer fell back to. These
// units have no drawn death, and nothing is borrowed from another creature: every frame here is the
// unit's own shipped idle pixels moved by whole pixels, turned by a quarter, flipped or squashed.
// Nothing is scaled up or smoothed, so the palette and the integer grid are untouched.
//
//   attack   4 facings (s e n w; the renderer falls a diagonal back to its cardinal) x 6 frames, hit on
//            frame 3: a wind-up away from the foe, a lunge at it, a recover. A ground unit never
//            moves below its anchor row, so a lunge down the screen is a rear and a slam instead.
//   death    4 facings x 6 frames, held on the last: the blow's recoil, the tumble, the landing.
//   corpse   4 facings x 1 frame, the fall's last frame, held (ART_DIRECTION §6: lying flat, legs out).
//
// Methods (what a dead creature of that body does):
//   flip     legs-up: the quadruped, the insect, the spider and the bat turn like a coin (thin to an edge, then wide
//            again) and land on their backs (a vertical flip)
//   squash   the slime melts: its rows are dropped from the top down to a third of its height
//   fall     the humanoid goes over backwards: a stagger, a buckle, a quarter turn onto the floor
// A flier falls from its hover to the floor: its corpse rests on the anchor row like every body.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePNG, encodePNG, createImage, blit, pixelHash } from './png.mjs';
import { CLASSES } from '../../src/data/world/art-budget.js';
import { ALPHA_CUT } from '../../src/data/world/palette.js';
import { ROOT, ART_DIR } from './build.mjs';
import { isMain } from '../../tests/_is-main.mjs';

/* sprite id → the set that holds it and how its body falls. Every id is a monster of a live hunting ground. */
export const UNITS = Object.freeze({
  rat: { set: 'hunt', method: 'flip' },
  drain_rat: { set: 'hunt', method: 'flip' },
  slime: { set: 'hunt', method: 'squash' },
  sump_slime: { set: 'hunt', method: 'squash' },
  cistern_spider: { set: 'hunt', method: 'flip' },
  culvert_bat: { set: 'hunt', method: 'flip' },
  kobold_tosher: { set: 'hunt', method: 'fall' },
  rat_king: { set: 'hunt', method: 'fall' },
  hive_wasp: { set: 'mill', method: 'flip' },
});

const CARDINALS = ['s', 'e', 'n', 'w'];
const DERIVED = ['attack', 'death', 'corpse'];
const FRAMES = 6, HIT = 3;
/* the lunge: art px along the facing, per frame (the wind-up goes the other way). */
const LUNGE = [-1, -2, 2, 4, 2, 0];
const FACING_X = { s: 0, e: 1, n: 0, w: -1 };
/* down-screen a ground unit cannot move (below its anchor): it rears and slams. Up-screen it charges. */
const REAR = [0, -1, -2, 0, 0, 0], CHARGE_UP = [0, 0, -2, -3, -1, 0];
/* a flier dives and climbs freely: it hovers above its anchor. */
const DIVE = [-1, -2, 2, 4, 2, 0];
const SQUASH = [1, 0.85, 0.7, 0.55, 0.42, 0.34];

const opaque = (img, x, y) => img.data[(y * img.width + x) * 4 + 3] >= ALPHA_CUT;
function box(img) {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (opaque(img, x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}
function remap(img, w, h, at) {
  const out = createImage(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [sx, sy] = at(x, y);
    if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) continue;
    out.data.set(img.data.subarray((sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4), (y * w + x) * 4);
  }
  return out;
}
const flipY = (img) => remap(img, img.width, img.height, (x, y) => [x, img.height - 1 - y]);
/* A quarter turn, whole pixels: cw puts the top on the right, ccw on the left. The turn is about the frame centre. */
const quarter = (img, cw) => remap(img, img.width, img.height, (x, y) => (cw ? [y, img.height - 1 - x] : [img.width - 1 - y, x]));
/* Keep `frac` of the body's height by dropping rows, the foot row kept; nothing is scaled up. */
function squash(img, frac) {
  const b = box(img), h = b.y1 - b.y0 + 1, nh = Math.max(2, Math.round(h * frac));
  return remap(img, img.width, img.height, (x, y) => {
    const k = b.y1 - y;                       // rows up from the foot
    if (k < 0 || k >= nh) return [-1, -1];
    return [x, b.y1 - Math.floor((k * h) / nh)];
  });
}
/* Place `img`'s opaque box so its lowest row is `foot` and its centre column is `cx` (+ dx, kept inside the frame); a hop is held to the frame's top; anything else clipped is an error. */
function seat(img, foot, cx, dx = 0) {
  const b = box(img), out = createImage(img.width, img.height);
  /* a body as wide as its frame (the spider, the bat) lunges as far as the frame lets it */
  const ox = Math.max(-b.x0, Math.min(img.width - 1 - b.x1, Math.round(cx - (b.x0 + b.x1) / 2) + dx)), oy = Math.max(-b.y0, foot - b.y1);
  blit(out, img, 0, 0, img.width, img.height, ox, oy);
  const count = (i) => { let n = 0; for (let p = 3; p < i.data.length; p += 4) if (i.data[p] >= ALPHA_CUT) n++; return n; };
  if (count(out) !== count(img)) throw new Error('a derived frame is clipped by its 48 px frame (shift ' + ox + ',' + oy + ')');
  return out;
}

/** The six frames of one facing's fall. `idle` is the facing's own idle frame; `base` the floor row. */
function fall(idle, dir, method, base, hover) {
  const b = box(idle), cx = (b.x0 + b.x1) / 2, foot0 = b.y1;
  const away = -FACING_X[dir] || 0;
  const headLeft = dir === 'e' || dir === 's';              // the quarter turn that sends the head away from the foe
  /* how high the body rides above the floor on each frame (a flier starts at its hover and comes down to it) */
  const hop = method === 'fall' ? [0, 1, 0, 0, 1, 0] : [0, 2, 4, 3, 1, 0];
  const lift = hover ? [base - foot0, base - foot0 + 2, base - foot0 + 3, 6, 2, 0] : hop.map((v, i) => (i === 0 ? base - foot0 : v));
  const at = (img, i, dx = 0) => seat(img, base - lift[i], cx, dx);
  if (method === 'squash') return SQUASH.map((f, i) => at(f === 1 ? idle : squash(idle, f), i));
  if (method === 'flip') {
    /* the coin turn: the body thins to an edge, then fattens on its back */
    const back = flipY(idle);
    return [at(idle, 0), at(squash(idle, 0.75), 1, away), at(squash(idle, 0.4), 2, away), at(flipY(squash(idle, 0.6)), 3, away), at(back, 4, away), at(back, 5)];
  }
  const down = quarter(idle, !headLeft);
  return [at(idle, 0), at(idle, 1, away), at(squash(idle, 0.85), 2, 2 * away), at(squash(idle, 0.6), 3, 2 * away), at(down, 4, away), at(down, 5)];
}

/** The six frames of one facing's blow. */
function lunge(idle, dir, hover) {
  const b = box(idle), cx = (b.x0 + b.x1) / 2, foot = b.y1;
  return LUNGE.map((k, i) => {
    let dx = k * FACING_X[dir] || 0, dy = 0;
    if (dir === 's') dy = hover ? DIVE[i] : REAR[i];
    if (dir === 'n') dy = hover ? -DIVE[i] : CHARGE_UP[i];
    return seat(idle, foot + dy, cx, dx);
  });
}

function rowsOf(anims) { return anims.reduce((n, a) => n + Object.keys(a.dirs).length, 0); }

/** The sheet and sidecar a unit gets: its own rows untouched, then attack, death and corpse. */
export function derive(sc, sheet, method) {
  const cls = CLASSES[sc.class];
  const [fw, fh] = cls.frame, [, ay] = cls.anchor, hover = cls.contact === 'flier' ? (sc.hover_px || 0) : 0;
  const keep = sc.anims.filter((a) => !DERIVED.includes(a.name));
  const idle = keep.find((a) => a.name === 'idle');
  const dirs = ['s', 'e', 'n', 'w', 'se', 'sw', 'ne', 'nw'].filter((d) => idle.dirs[d]);
  const idleOf = (d) => crop1(sheet, 0, dirs.indexOf(d), fw, fh);
  const attack = {}, death = {}, corpse = {};
  for (const d of CARDINALS) {
    attack[d] = lunge(idleOf(d), d, hover);
    death[d] = fall(idleOf(d), d, method, ay, hover);
    corpse[d] = [death[d][FRAMES - 1]];
  }
  const clips = [['attack', 10, attack, HIT], ['death', 10, death], ['corpse', 0, corpse]];
  const keepRows = rowsOf(keep), cols = Math.max(sheet.width / fw, FRAMES);
  const out = createImage(cols * fw, (keepRows + clips.reduce((n, c) => n + CARDINALS.length, 0)) * fh);
  blit(out, sheet, 0, 0, sheet.width, keepRows * fh, 0, 0);
  let r = keepRows;
  for (const [, , frames] of clips) for (const d of CARDINALS) { frames[d].forEach((img, i) => blit(out, img, 0, 0, fw, fh, i * fw, r * fh)); r++; }
  const anims = keep.concat(clips.map(([name, fps, frames, hit]) => ({ name, fps, loop: false, ...(hit !== undefined ? { hit } : {}),
    dirs: Object.fromEntries(CARDINALS.map((d) => [d, frames[d].length])) })));
  return { sheet: out, anims };
}
function crop1(sheet, col, row, fw, fh) { const f = createImage(fw, fh); blit(f, sheet, col * fw, row * fh, fw, fh, 0, 0); return f; }

const NOTE = ' attack, death and corpse derived from this unit\'s own idle frames by tools/world-art/derive-combat.mjs (whole-pixel shifts, quarter turns, flips; no drawn death exists).';

function run(check) {
  let stale = 0;
  for (const [id, u] of Object.entries(UNITS)) {
    const dir = join(ROOT, ART_DIR, u.set), jsonPath = join(dir, id + '.json'), pngPath = join(dir, id + '.png');
    const sc = JSON.parse(readFileSync(jsonPath, 'utf8'));
    const { sheet, anims } = derive(sc, decodePNG(readFileSync(pngPath)), u.method);
    const next = { ...sc, anims, notes: sc.notes.replace(NOTE, '') + NOTE };
    const same = JSON.stringify(next) === JSON.stringify(sc) && pixelHash(sheet) === pixelHash(decodePNG(readFileSync(pngPath)));
    if (check) { if (!same) { stale++; console.log('  ✗ ' + u.set + '/' + id + ': its combat clips are not what derive-combat.mjs writes'); } continue; }
    writeFileSync(pngPath, encodePNG(sheet));
    writeFileSync(jsonPath, JSON.stringify(next, null, 2) + '\n');
    console.log('  ✓ ' + u.set + '/' + id + ' (' + u.method + ': attack, death, corpse x ' + CARDINALS.length + ' facings)');
  }
  if (check) { console.log(stale ? 'derive-combat --check: RED' : 'derive-combat --check: green'); process.exit(stale ? 1 : 0); }
}

if (isMain(import.meta.url)) {
  try { run(process.argv.includes('--check')); } catch (e) { console.error('derive-combat: ' + (e && e.stack || e)); process.exit(2); }
}
