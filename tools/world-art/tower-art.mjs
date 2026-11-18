#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/tower-art.mjs — THE HEARTH CHEST, ITS SMOKE AND ITS REVEALS (lane/a-tower-art; the big chest lane/fix138-hearth-chest-big; its green lane/a-chest-glow-139).
//
// The Burning Tower's chest (Tyler 2026-11-14: "burning tower chests that sit on the ledge of the Great Hearth"; ONE chest, "varies loot
// based on the key"; the locked story: "the Keepers locked them all in one big chest on the ledge, with a different lock for the better
// ones"). Tyler 2026-11-17: "the chest needs to be more 'special' as it's a big deal to open it ... some sort of low glow, maybe some black /
// green smoke leaking out maybe bigger as well?" and "periodically the chest should 'bump' slightly open like something is trying to get
// out". ONE generated chest, PixelLab on hr-world-56-v2, every source 56 px wide with the box on the same columns and its foot on `foot`
// (art/world-src/gen-2026-11-17/hearth-chest-big, 01-note.json):
//   SHUT  imp-s13 (edit_image_pro_flash of s37): heavy iron-bound chest, a chain across the lid, the Keepers' sun scorched into it, green
//         light at the seam and in the four keyholes, the third lock gold
//   PEAK  bump-s3 (edit on the shut chest on a 56x64 canvas): the lid jolted up, the chain taut, a hard green band, sparks out of the sides
//   OPEN  open-s7 (edit of s37 on 56x72): the lid tipped back, green light and smoke inside. Its box below the seam is the shut chest's
// Every source is snapped onto the whole palette (palette.mjs reads art/world/palette.json: no colour is written here as a literal), binary
// alpha, nothing scaled. The rest is the pipeline's own: the box below the seam held to the shut chest's pixels, the four locks poured onto
// each key's soot-dulled metal by value (LOCKS: Bronze, Silver, Gold, Platinum left to right), the fire's light on the iron facing it and a
// glint passing over the locks, the green kept to the locks alone and breathing slowly (BREATH, Tyler 2026-11-18: "keep the chest green...
// concentrate the color around the keyhole and fittings and give it a slow, subtle pulse"), the locks flashing warm gold once when a key
// turns (FLASH: "have the lock flash warm gold when the special key turns"), the lid lifted on a stepped line of light (crack, never the
// generation's soft smear: the review of bump-s17), and the town's own smoke (town-life.mjs smoke) in black and green.
//
//   art/world/townlife/hearth_chest.png        THE CHEST ON THE HEARTH (src/data/world/town/sites.js AMBIENT): `idle` 40 frames at the town's
//                                               beat (5 s: the fire's light x5, the glint, one slow breath of the keyholes), `bump` 8 frames
//                                               (lid lifted, the peak held, lifted, slammed with a 1 px shake) that stand for idle 0-7 in a
//                                               bump loop, `flash` 6 frames (the locks warm gold, fading back to green) the server's window
//                                               sets off (src/data/world/hearth-moods.js CHEST_FLASH)
//   art/world/townlife/hearth_chest_smoke.png  ITS SMOKE leaking from the seam and keyholes, in step: idle 40, bump 40 (a puff at the peak,
//                                               dust at the slam). The bump loops are chosen at run time (src/world/core/ambient.js bumpAt)
//   assets/ui/tower/chest-open-<key>.png       THE KEY'S OPENING (the Tower window's Chest tab, src/shell/windows/tower-chest.js): 8 frames of
//                                               FW x FH, shown at x2: the key's lock catches the light, the lid cracks on green, jolts, opens,
//                                               green embers and smoke climb out
//   assets/ui/tower/chest-column-<key>.png     THE WEAPON'S REVEAL over the opening's last frame: 4 frames, a stepped light column in the key's
//                                               metal rising out of it (three bands, no bloom: ART_DIRECTION §8); the item's icon rises in it (CSS)
// The chest casts no light on the stone (lane/a-chest-glow-139: the pool of green round its foot is gone; its green is its keyholes').
// A key row with no metal here is a finding (a later key is a row in src/data/chests.js CHEST_KEYS; its lock and column need a ramp).
//
//   node tools/world-art/tower-art.mjs           write them (then: node tools/world-art/build.mjs --set townlife)
//   node tools/world-art/tower-art.mjs --check   exit 1 when a written file differs from a fresh drawing, or a key has no metal
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImage, encodePNG, decodePNG } from './png.mjs';
import { snapTo } from './lock.mjs';
import { PALETTE, RAMPS } from './palette.mjs';
import { smoke } from './town-life.mjs';
import { CHEST_KEYS } from '../../src/data/chests.js';
import { AMBIENT } from '../../src/data/world/town/sites.js';
import { LIFE_BEAT_FPS } from '../../src/data/world/ambient-life.js';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = 'art/world-src/gen-2026-11-17/hearth-chest-big/';
/* the kept generations: the box's foot row in each canvas, the shut chest's seam (the green line under the chain: the lid is above it),
   and each lock's body [x0, y0, x1, y1] in the canvas (bronze, silver, gold, platinum) */
const SHUT = Object.freeze({ file: SRC + 'imp-s13-f612d55e.png', foot: 47, seam: 24,
  locks: Object.freeze([[11, 30, 16, 35], [19, 30, 25, 35], [31, 30, 36, 35], [40, 30, 46, 35]]) });
const PEAK = Object.freeze({ file: SRC + 'bump-s3-72d74260.png', foot: 59,
  locks: Object.freeze([[11, 38, 16, 43], [19, 37, 25, 42], [31, 37, 36, 42], [40, 38, 46, 43]]) });
const OPEN = Object.freeze({ file: SRC + 'open-s7-9884f4e5.png', foot: 67 });

/* THE CHEST'S FRAME in the town: CW x CH, its foot on the last row, the peak's lid and sparks inside it */
export const CW = 56, CH = 50, ANCHOR = Object.freeze([28, CH - 1]);
export const SEAM = SHUT.seam - SHUT.foot + ANCHOR[1];   /* the seam's row in the frame */
/* the shut chest's four locks in its frame, [x0, y0, x1, y1] (bronze, silver, gold, platinum): where its green may be (tests/town-life.mjs TL-CHEST) */
export const CHEST_LOCKS = Object.freeze(SHUT.locks.map(([x0, y0, x1, y1]) => Object.freeze([x0, y0 + ANCHOR[1] - SHUT.foot, x1, y1 + ANCHOR[1] - SHUT.foot])));

const R = (ramp, i) => RAMPS[ramp][i];
const C = Object.freeze({ K: R('shadow', 0), hot: R('mithril', 3) });
/* EACH KEY'S METAL in the window's light: the reveal's column and the Climb tab's landing plates, dark to light (palette ramps: bronze,
   steel, bronze-and-gold, mithril) */
export const METALS = Object.freeze({
  bronze: Object.freeze([R('bronze', 0), R('bronze', 2), R('bronze', 3)]),
  silver: Object.freeze([R('steel', 0), R('steel', 2), R('steel', 3)]),
  gold: Object.freeze([R('bronze', 2), R('gold', 0), R('torch', 1)]),
  platinum: Object.freeze([R('mithril', 1), R('mithril', 2), R('mithril', 3)]),
});
/* EACH KEY'S LOCK ON THE CHEST, [dark, body, lit, glint] (lane/fix137-hearth-chest-art, Tyler 2026-11-17: the plates in the window's bright
   metals read as candy dots on the sooty Hearth). Old metal dulled by the fire like the Hearth's own iron: a lock is told by its body's
   metal and value (bronze brown, silver cool iron, gold, platinum pale warm grey), and its shine is a glint, never a coloured plate. */
export const LOCKS = Object.freeze({
  bronze: Object.freeze([R('bronze', 0), R('bronze', 1), R('bronze', 2), R('bronze', 3)]),
  silver: Object.freeze([R('iron', 1), R('iron', 2), R('iron', 3), R('steel', 3)]),
  gold: Object.freeze([R('bronze', 2), R('bronze', 3), R('gold', 0), R('torch', 1)]),
  platinum: Object.freeze([R('stone', 2), R('stone', 3), R('stone', 4), R('bone', 1)]),
});
/* WHICH SIDE THE FIRE IS ON: the chest's ambient row against the fire's (src/data/world/town/sites.js), so its light falls on the iron that
   faces the firebox wherever the chest is seated */
const AT = Object.fromEntries(AMBIENT.map((a) => [a.id, a]));
const seatX = (a) => a.x * 32 + (a.dx || 0);
export const FIRE_SIDE = AT.hearth_chest && AT.hearth_fire && seatX(AT.hearth_chest) > seatX(AT.hearth_fire) ? 'left' : 'right';

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hexAt = (img, x, y) => { const i = (y * img.width + x) * 4; return '#' + [0, 1, 2].map((k) => img.data[i + k].toString(16).padStart(2, '0')).join(''); };
const opaque = (img, x, y) => x >= 0 && y >= 0 && x < img.width && y < img.height && img.data[(y * img.width + x) * 4 + 3] === 255;
function put(img, x, y, hex) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  const [r, g, b] = rgb(hex);
  img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
}
/* src's opaque pixels laid on dst with src's (0, 0) at (dx, dy) */
function lay(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    const i = (y * src.width + x) * 4;
    if (src.data[i + 3] === 255) put(dst, x + dx, y + dy, '#' + [0, 1, 2].map((k) => src.data[i + k].toString(16).padStart(2, '0')).join(''));
  }
}
const lum = (hex) => { const [r, g, b] = rgb(hex).map((v) => { const u = v / 255; return u > 0.04045 ? ((u + 0.055) / 1.055) ** 2.4 : u / 12.92; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/* a generation as the palette holds it: every opaque pixel snapped, the rest clear */
const source = (s) => snapTo(decodePNG(readFileSync(join(ROOT, s.file))), PALETTE);

/* THE GREEN LIGHT, dark to bright (hr-world-56-v2's greens by value: the keyholes breathe along it, a lifted lid's light is laid on it); a
   generated green's place on it is its nearest by value */
const GLOW = Object.freeze([R('leaf', 2), R('leaf', 3), R('leaf', 4), R('leaf', 5), R('venom', 0)]);
const GREENS = new Set([...RAMPS.leaf, ...RAMPS.moss, ...RAMPS.venom]);
const glowStep = (hex) => GLOW.reduce((best, c, i) => (Math.abs(lum(c) - lum(hex)) < Math.abs(lum(GLOW[best]) - lum(hex)) ? i : best), 0);
/* THE LOOP: 40 frames at the town's beat (5 s), the fire's 8-frame light five times over and one slow breath of the keyholes */
export const LOOP = 40;
/* A LIFTED LID'S LIGHT (the bump's lift and peak): every green on the chest `d` steps up the GLOW ramp, as the bump has always drawn it */
function breathe(img, d) {
  if (!d) return;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (!opaque(img, x, y)) continue;
    const h = hexAt(img, x, y);
    if (GREENS.has(h)) put(img, x, y, GLOW[Math.max(0, Math.min(GLOW.length - 1, glowStep(h) + d))]);
  }
}

/* THE FOUR LOCKS on an image whose source canvas sits at (dx, dy): each body's metal (no outline, no keyhole light, nothing as dark as the
   oak behind it) poured by its value onto its key's LOCKS ramp, [dark, body, lit]. `glint`: the keys whose lock catches the fire this frame
   (its top-left metal the glint, the next lit); `lit`: the key (or keys) being used, every pixel one step up; `warm`: the keys whose lock
   flashes this frame, poured onto WARM instead of its own metal. */
const OAK = lum(R('earth', 2));
/* THE KEY TURNING: a lock lit warm gold, [dark, body, lit, glint] (the bronze's two lightest, the gold; the torch's palest is the glint and the
   keyhole, the brightest point on it) */
const WARM = Object.freeze([R('bronze', 2), R('bronze', 3), R('gold', 0), R('torch', 1)]);
function locks(img, rects, dx, dy, lit, glint = [], warm = []) {
  CHEST_KEYS.slice(0, rects.length).forEach((k, n) => {
    const [x0, y0, x1, y1] = rects[n], ramp = warm.includes(k.id) ? WARM : LOCKS[k.id];
    const px = [];
    for (let y = y0 + dy; y <= y1 + dy; y++) for (let x = x0 + dx; x <= x1 + dx; x++) {
      if (!opaque(img, x, y)) continue;
      const h = hexAt(img, x, y);
      if (RAMPS.shadow.includes(h) || GREENS.has(h) || lum(h) < OAK) continue;
      px.push([x, y, lum(h)]);
    }
    if (!px.length) return;
    const lo = Math.min(...px.map((p) => p[2])), hi = Math.max(...px.map((p) => p[2]));
    const top = px.reduce((a, p) => (p[0] + p[1] < a[0] + a[1] ? p : a));
    for (const [x, y, l] of px) {
      const t = hi > lo ? (l - lo) / (hi - lo) : 0.5;
      let s = t < 0.3 ? 0 : t < 0.75 ? 1 : 2;
      if (lit === k.id || (Array.isArray(lit) && lit.includes(k.id))) s += 1;
      if (glint.includes(k.id) && x === top[0] && y === top[1]) s = 3;
      else if (glint.includes(k.id) && x === top[0] + 1 && y === top[1]) s = Math.max(s, 2);
      put(img, x, y, ramp[Math.min(3, s)]);
    }
  });
}

/* THE GREEN AT THE LOCKS ONLY (Tyler 2026-11-18: "keep the chest green... concentrate the color around the keyhole and fittings and give it a
   slow, subtle pulse"). On a shut chest the generation's green stays in two places a lock: its KEYHOLE (the greens inside its body) and its
   HASP, where the lock's shackle hangs from the seam (the seam's greens over the keyhole's column, a pixel each side). Every other green the
   generation laid, the seam's long band and its spill, is the dark of a shut seam (the seam's own row the crack, the rows by it the lid's
   shade). The keyholes and hasps breathe on BREATH: 2 as made, 1 the middle of each (the keyhole's middle pixel, the hasp's own column) as made
   and the rest one GLOW step down, 0 all of it one step down; one step at most, a 5 s loop (a cosine on three levels). */
export const BREATH = Object.freeze(Array.from({ length: LOOP }, (_, f) => Math.round(1 + Math.cos((2 * Math.PI * f) / LOOP))));
const HASP_ROWS = 2;
/** The keyholes and hasps of a shut pose, as made: { holes, hasps } of [x, y, hex, middle], and the rest of its greens [x, y]. */
function lockLights(p) {
  const holes = [], hasps = [], rest = [];
  const greens = [];
  for (let y = 0; y < p.img.height; y++) for (let x = 0; x < p.img.width; x++) if (opaque(p.img, x, y) && GREENS.has(hexAt(p.img, x, y))) greens.push([x, y]);
  const boxes = p.rects.map(([x0, y0, x1, y1]) => [x0 + p.ldx, y0 + p.ldy, x1 + p.ldx, y1 + p.ldy]);
  const inBox = ([x, y], [x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  /* each lock's keyhole: its greens, the column they stand in and their middle row */
  const keys = boxes.map((b) => {
    const px = greens.filter((g) => inBox(g, b));
    if (!px.length) return null;
    const ys = px.map((g) => g[1]).sort((a, c) => a - c);
    return { px, x: Math.round(px.reduce((s, g) => s + g[0], 0) / px.length), y: ys[Math.floor(ys.length / 2)] };
  });
  for (const g of greens) {
    const [x, y] = g, hex = hexAt(p.img, x, y);
    const k = keys.find((kk, n) => kk && inBox(g, boxes[n]));
    if (k) { holes.push([x, y, hex, x === k.x && y === k.y]); continue; }
    const h = keys.find((kk) => kk && y >= SEAM && y < SEAM + HASP_ROWS && Math.abs(x - kk.x) <= 1);
    if (h) hasps.push([x, y, hex, x === h.x && y === SEAM]); else rest.push([x, y]);
  }
  return { holes, hasps, rest };
}
const SEAM_DARK = R('shadow', 2), SHADE_DARK = R('shadow', 3);
const stepped = (hex, d) => (d ? GLOW[Math.max(0, Math.min(GLOW.length - 1, glowStep(hex) + d))] : hex);
/* a shut pose's green kept to its locks, at BREATH `level`, `boost` steps up (the slam's afterglow) */
function ember(p, level, boost = 0) {
  const { holes, hasps, rest } = lockLights(p);
  for (const [x, y] of rest) put(p.img, x, y, y === SEAM ? SEAM_DARK : SHADE_DARK);
  for (const [x, y, hex, middle] of holes.concat(hasps)) put(p.img, x, y, stepped(hex, (level === 2 || (level === 1 && middle) ? 0 : -1) + boost));
  return p;
}

/* THE KEY TURNING (Tyler 2026-11-18: "have the lock flash warm gold when the special key turns"): FLASH frames on the beat (750 ms), [the
   locks' metal, the keyholes, the hasps]: 'warm' every lock poured onto WARM, 'lit' its own metal a step up; then each keyhole and hasp a
   palette colour, warm gold fading through the olive back to its own green (null: as made). Played once, when the server opens the
   chest's window (src/data/world/hearth-moods.js CHEST_FLASH, src/world/hearth-burn.js). */
const OLIVE = R('moss', 1);
export const FLASH = Object.freeze([
  Object.freeze(['warm', R('torch', 1), R('gold', 0)]), Object.freeze(['warm', R('torch', 1), R('gold', 0)]),
  Object.freeze(['lit', R('gold', 0), R('bronze', 3)]), Object.freeze([null, R('gold', 0), OLIVE]),
  Object.freeze([null, OLIVE, null]), Object.freeze([null, null, null])]);
/* a shut pose's locks at FLASH frame `s`: `keys` the locks that flash (every lock in town; the turned key's in the Tower window) */
function flash(p, s, keys, f) {
  const [metal, hole, hasp] = FLASH[s];
  const lights = lockLights(p);
  locks(p.img, p.rects, p.ldx, p.ldy, metal === 'lit' ? keys : null, glintsAt(f), metal === 'warm' ? keys : []);
  ember(p, 2);
  const mine = (x) => keys.some((id) => { const n = CHEST_KEYS.findIndex((k) => k.id === id), r = p.rects[n]; return r && x >= r[0] + p.ldx - 1 && x <= r[2] + p.ldx + 1; });
  for (const [x, y] of lights.holes) if (hole && mine(x)) put(p.img, x, y, hole);
  for (const [x, y] of lights.hasps) if (hasp && mine(x)) put(p.img, x, y, hasp);
  return p;
}

/* THE FIRE'S LIGHT ON IT: the Great Hearth's fire burns beside the chest (its 8-frame loop at 8 fps, hearth_fire), so the chest's iron on the
   fire's side (FIRE_SIDE) takes that light, one value step up its own ramp, over more or fewer of its rows frame by frame, and its locks
   catch it in turn: the lock nearest the fire leads, each next one two frames behind, a glint where the fire is high (GLINT_AT). */
export const FLICKER = Object.freeze([1, 2, 4, 3, 5, 2, 3, 1]);
const GLINT_AT = 4, GLINT_LAG = 2;
const upRamp = (n) => RAMPS[n].slice(0, -1).map((c, i) => [c, RAMPS[n][i + 1]]);
const STEP_UP = Object.freeze(Object.fromEntries([[R('shadow', 3), R('stone', 0)], ...upRamp('stone'), ...upRamp('iron'), ...upRamp('steel')]));
const LIT_COLS = 9;

/** The keys whose lock glints on frame f: the lock nearest the fire first. */
export function glintsAt(f) {
  const keys = CHEST_KEYS.slice(0, SHUT.locks.length).map((k) => k.id);
  const fromFire = FIRE_SIDE === 'right' ? keys.slice().reverse() : keys;
  return fromFire.filter((id, n) => FLICKER[(f + FLICKER.length - (n * GLINT_LAG) % FLICKER.length) % FLICKER.length] >= GLINT_AT);
}
function firelight(img, f) {
  const rows = FLICKER[f % FLICKER.length];
  const xs = FIRE_SIDE === 'right' ? img.width - LIT_COLS : 0;
  let top = img.height;
  for (let y = 0; y < img.height && top === img.height; y++) for (let x = 0; x < img.width; x++) if (opaque(img, x, y)) { top = y; break; }
  for (let y = top + 1; y < Math.min(img.height - 1, top + 1 + rows * 5); y++) for (let x = xs; x < xs + LIT_COLS; x++) {
    const up = opaque(img, x, y) && STEP_UP[hexAt(img, x, y)];
    if (up) put(img, x, y, up);
  }
}

/* THE POSES, each a CW x CH frame with the box's foot on the last row (dx: a shake, whole px) */
const SHUT_IMG = source(SHUT), PEAK_IMG = source(PEAK);
function shut(dx = 0) {
  const img = createImage(CW, CH);
  lay(img, SHUT_IMG, dx, ANCHOR[1] - SHUT.foot);
  return { img, rects: SHUT.locks, ldx: dx, ldy: ANCHOR[1] - SHUT.foot };
}
/* THE LID LIFTED `up` px on a stepped line of light: the lid and its chain (the rows above the seam) raised, the rows they leave a band of the
   green light (hot points on its lower row, the outline kept at its ends), the box below as it was */
function lifted(up) {
  const img = createImage(CW, CH), dy = ANCHOR[1] - SHUT.foot;
  for (let y = 0; y < SHUT_IMG.height; y++) for (let x = 0; x < SHUT_IMG.width; x++) {
    const i = (y * SHUT_IMG.width + x) * 4;
    if (SHUT_IMG.data[i + 3] !== 255) continue;
    put(img, x, y + dy - (y < SHUT.seam ? up : 0), '#' + [0, 1, 2].map((k) => SHUT_IMG.data[i + k].toString(16).padStart(2, '0')).join(''));
  }
  for (let r = 0; r < up; r++) {
    const y = SEAM - 1 - r;
    const row = []; for (let x = 0; x < CW; x++) if (opaque(img, x, SEAM)) row.push(x);
    if (!row.length) continue;
    const a = row[0], b = row[row.length - 1];
    for (let x = a; x <= b; x++) put(img, x, y, x === a || x === b ? C.K : r === 0 && (x - a) % 4 === 2 ? C.hot : GLOW[Math.max(2, GLOW.length - 1 - r)]);
  }
  return { img, rects: SHUT.locks, ldx: 0, ldy: dy };
}
function peak() {
  const img = createImage(CW, CH);
  lay(img, PEAK_IMG, 0, ANCHOR[1] - PEAK.foot);
  return { img, rects: PEAK.locks, ldx: 0, ldy: ANCHOR[1] - PEAK.foot };
}
/* a pose finished for frame f: its locks, its green (a shut lid: kept to the locks at BREATH's `level`, `light` steps up after a slam; a lifted
   lid: every green `light` steps up, the light pouring out), the fire's light */
function finish(p, f, o = {}) {
  locks(p.img, p.rects, p.ldx, p.ldy, null, glintsAt(f));
  if (o.lifted) { firelight(p.img, f); breathe(p.img, o.light); return p.img; }
  ember(p, o.level === undefined ? BREATH[f % LOOP] : o.level, o.light || 0);
  firelight(p.img, f);
  return p.img;
}

/* THE BUMP (Tyler 2026-11-17: "bump slightly open like something is trying to get out"): 8 frames standing for idle 0-7 of a bump loop.
   [pose, its light]: the lid lifts on its light, jolts to the peak and holds it 3 beats (375 ms), drops back to the lift, slams shut with a
   1 px shake (the keyholes a step bright) and settles */
export const BUMP = Object.freeze([['lift', 1], ['peak', 2], ['peak', 3], ['peak', 3], ['lift', 2], ['shake+', 1], ['shake-', 1], ['shut', 0]]);
const pose = (name) => (name === 'lift' ? lifted(3) : name === 'peak' ? peak() : name === 'shake+' ? shut(1) : name === 'shake-' ? shut(-1) : shut());
const LIFTED = new Set(['lift', 'peak']);

/* a sheet of rows of frames (one row a clip, shorter rows left-aligned: tools/world-art/build.mjs reads one row per clip) */
function sheet(rows) {
  const w = rows[0][0].width, h = rows[0][0].height, n = Math.max(...rows.map((r) => r.length));
  const img = createImage(w * n, h * rows.length);
  rows.forEach((row, r) => row.forEach((one, i) => lay(img, one, i * w, r * h)));
  return img;
}

/** THE CHEST ON THE HEARTH: row 0 `idle` (LOOP frames), row 1 `bump` (BUMP.length frames), row 2 `flash` (FLASH.length frames: every lock). */
export function drawChest() {
  const keys = CHEST_KEYS.slice(0, SHUT.locks.length).map((k) => k.id);
  return sheet([Array.from({ length: LOOP }, (_, f) => finish(shut(), f)),
    BUMP.map(([name, light], f) => finish(pose(name), f, { lifted: LIFTED.has(name), level: 2, light })),
    FLASH.map((_, s) => { const p = flash(shut(), s, keys, s); firelight(p.img, s); return p.img; })]);
}
/** The idle loop alone, CW x CH frames in a row (the Tower window's chest). */
export const drawChestIdle = () => sheet([Array.from({ length: LOOP }, (_, f) => finish(shut(), f))]);

/* ITS SMOKE: thin wisps leaking from the seam and the keyholes (the town's own smoke, town-life.mjs, in black and green inks), SW x SH, the
   chest's foot at SMOKE_ANCHOR; each emitter starts its puffs at its own frame. The bump adds a green and a black puff out of the seam at the
   peak and dust off the stone at both feet at the slam. */
export const SW = 72, SH = 76, SMOKE_ANCHOR = Object.freeze([36, 71]);
const SX = SMOKE_ANCHOR[0] - ANCHOR[0], SY = SMOKE_ANCHOR[1] - ANCHOR[1];   /* the chest's frame in the smoke's */
const INKS = Object.freeze({
  green: Object.freeze({ lit: R('venom', 0), body: R('leaf', 4), shade: R('leaf', 2) }),
  black: Object.freeze({ lit: R('stone', 0), body: R('shadow', 2), shade: R('shadow', 0) }),
  dust: Object.freeze({ lit: R('stone', 4), body: R('stone', 3), shade: R('stone', 2) }),
});
const WISP = Object.freeze({ w: SW, h: SH, n: LOOP, every: 4, life: 18, rise: 28, ease: 1.1, drift: 5, r0: 1.1, r1: 2.6, lumpy: 0.5, jitter: 0.8, sway: 1.4, thinFrom: 0.45 });
/* [x, y in the chest's frame, ink, the frame its first puff is born on, seed] */
const LEAKS = Object.freeze([[11, SEAM, 'black', 0, 0xc4e51], [36, SEAM, 'green', 2, 0xc4e54], [44, SEAM, 'black', 1, 0xc4e52, { every: 8 }]]);
const PUFFS = Object.freeze([[24, SEAM, 'green', 1, 0xb0a1, { every: LOOP, life: 14, rise: 34, ease: 1.5, drift: 6, r0: 2.5, r1: 6, lumpy: 1.5, jitter: 2, sway: 1.5, thinFrom: 0.35 }],
  [34, SEAM, 'black', 1, 0xb0a2, { every: LOOP, life: 12, rise: 28, ease: 1.5, drift: 8, r0: 2, r1: 5, lumpy: 1.2, jitter: 2, sway: 1.5, thinFrom: 0.35 }],
  [6, ANCHOR[1] - 1, 'dust', 5, 0xd051, { every: LOOP, life: 6, rise: 4, ease: 1, drift: -7, r0: 1.5, r1: 3.5, lumpy: 0.5, jitter: 1, sway: 0.5, thinFrom: 0.2 }],
  [50, ANCHOR[1] - 1, 'dust', 5, 0xd052, { every: LOOP, life: 6, rise: 4, ease: 1, drift: 7, r0: 1.5, r1: 3.5, lumpy: 0.5, jitter: 1, sway: 0.5, thinFrom: 0.2 }]]);
/* one emitter's LOOP frames of keys, its births moved to `from` */
function emitter([x, y, ink, from, seed, o = {}]) {
  const frames = smoke(Object.assign({}, WISP, o, { ax: x + SX, ay: y + SY, seed }));
  return { ink, frames: frames.map((_, f) => frames[(f - from + LOOP * 4) % LOOP]) };
}
function inked(list, f) {
  const img = createImage(SW, SH);
  for (const e of list) e.frames[f].forEach((line, y) => line.forEach((k, x) => { if (k) put(img, x, y, INKS[e.ink][k]); }));
  return img;
}
/** The smoke: row 0 `idle` (the wisps), row 1 `bump` (the wisps with the puffs and the dust, a whole loop). */
export function drawSmoke() {
  const wisps = LEAKS.map((l) => emitter(l)), puffs = PUFFS.map((p) => emitter(p));
  /* black under green, the puffs over the wisps */
  return sheet([Array.from({ length: LOOP }, (_, f) => inked(wisps, f)), Array.from({ length: LOOP }, (_, f) => inked(wisps.concat(puffs), f))]);
}

/* THE REVEAL'S FRAME: FW x FH art px, the chest's frame centred on its last rows (its foot on the last row but one); the open lid, the embers
   and the smoke above it */
export const FW = 64, FH = 80;
const OX = Math.floor((FW - CW) / 2), OY = FH - 1 - CH;   /* the chest's frame's top-left in the reveal */
/* the open chest: its box below the seam is the shut chest's own pixels (the edit kept them; this holds them exactly) */
function opened() {
  const o = source(OPEN), img = createImage(CW, CH + (OPEN.foot - ANCHOR[1]));
  const top = OPEN.foot - ANCHOR[1];   /* the open canvas's rows above the chest's frame */
  lay(img, o, 0, 0);
  for (let y = SHUT.seam + 1; y <= SHUT.foot; y++) for (let x = 0; x < CW; x++) {
    const s = (y * SHUT_IMG.width + x) * 4, d = ((y - SHUT.foot + OPEN.foot) * img.width + x) * 4;
    img.data.set(SHUT_IMG.data.subarray(s, s + 4), d);
  }
  return { img, top };
}
/* the open chest's glowing mouth, in the reveal's rows */
const MOUTH_Y = OY + 22;
/* green embers climbing out of the open chest: a fixed set, each a pixel, higher and fewer frame by frame. [dx, rise, kind] */
const EMBERS = Object.freeze([[-11, 2, 1], [-6, 5, 0], [-1, 1, 2], [3, 6, 1], [5, 3, 0], [10, 5, 2], [12, 1, 1], [-8, 8, 2], [4, 9, 0], [-3, 11, 1], [7, 10, 2], [0, 13, 0]]);
const EMBER = Object.freeze([C.hot, R('venom', 0), R('leaf', 4)]);
function embers(img, cx, mouthY, step) {
  for (const [dx, rise, kind] of EMBERS) {
    const y = mouthY - rise - step * 6;
    if (y < 1 || step * 3 + kind > 11) continue;
    const drift = Math.round(Math.sin((rise + step) * 1.7));
    put(img, cx + dx + drift, y, EMBER[kind]);
  }
}
/* the smoke out of the open mouth: the town's smoke in green, born frame by frame from the opening on (no puff older than the lid) */
const MOUTH_SMOKE = smoke({ w: FW, h: FH, ax: FW / 2 - 2, ay: MOUTH_Y, n: 32, every: 1, life: 10, rise: 50, ease: 1.3, drift: 6, r0: 1.5, r1: 4, lumpy: 1, jitter: 3, sway: 1.5, thinFrom: 0.4, seed: 0x0be5 });

/** THE KEY'S OPENING, 8 frames of FW x FH in a row: shut, its lock lit, the lid cracked on green, the jolt, then open and climbing. */
export function drawOpen(keyId) {
  if (!METALS[keyId]) throw new Error('no metal for key ' + keyId);
  /* shut with its green at the locks; the key turns (its lock flashes warm gold: FLASH's first frame); the lid cracks, jolts, opens */
  const plan = [{ pose: 'shut' }, { pose: 'turn' }, { pose: 'lift', lit: keyId }, { pose: 'peak', lit: keyId }, { e: 0 }, { e: 1 }, { e: 2 }, { e: 3 }];
  const frames = plan.map((s) => {
    const one = createImage(FW, FH);
    if (s.pose === 'shut' || s.pose === 'turn') {
      const p = shut();
      if (s.pose === 'turn') flash(p, 0, [keyId], 0);
      else { locks(p.img, p.rects, p.ldx, p.ldy, null); ember(p, 2); }
      lay(one, p.img, OX, OY);
    } else if (s.e === undefined) {
      const p = s.pose === 'lift' ? lifted(2) : peak();
      locks(p.img, p.rects, p.ldx, p.ldy, s.lit || null);
      breathe(p.img, s.pose === 'peak' ? 2 : 1);
      lay(one, p.img, OX, OY);
    } else {
      const o = opened();
      locks(o.img, SHUT.locks, 0, OPEN.foot - SHUT.foot, null);
      lay(one, o.img, OX, OY - o.top);
      MOUTH_SMOKE[s.e].forEach((line, y) => line.forEach((k, x) => { if (k) put(one, x, y, INKS.green[k]); }));
      embers(one, FW / 2, MOUTH_Y, s.e);
    }
    return one;
  });
  return sheet([frames]);
}

/** THE WEAPON'S COLUMN, 4 frames of FW x FH in a row, over the opening's last frame: three bands of the key's metal, rising out of the mouth. */
export function drawColumn(keyId) {
  const m = METALS[keyId];
  if (!m) throw new Error('no metal for key ' + keyId);
  const n = 4, img = createImage(FW * n, FH);
  const cx = FW / 2 - 1, foot = MOUTH_Y - 2;
  [14, 28, 42, 42].forEach((r, i) => {
    const top = Math.max(1, foot - r);
    /* three straight bands, the outer shortest: the head steps in, the lightest band alone at its tip; the last frame shimmers */
    for (const [w, c, drop] of [[6, m[0], 6], [3, m[1], 3], [1, m[2], 0]]) {
      for (let y = top + drop; y <= foot; y++) {
        const cc = c === m[2] && i === 3 && (y & 2) ? m[1] : c;
        for (let x = cx - w; x <= cx + w + 1; x++) put(img, i * FW + x, y, cc);
      }
    }
  });
  return img;
}
/** Where the reveal's item starts (its 32 px icon's top-left, art px in the reveal's frame): centred on the column, in the chest's mouth. */
export const ITEM_AT = Object.freeze({ x: FW / 2 - 16, y: MOUTH_Y - 16 });

/* THE SIDECARS: the smoke's drawn by rule (style1.mjs DRAWN_CLASSES); the chest's is kept by hand (its PixelLab block), its clips written here
   from what is drawn (idle, bump, flash) */
const clip = (name, n, loop = false) => ({ name, fps: LIFE_BEAT_FPS, loop, dirs: { s: n } });
const clipRows = (bump) => [clip('idle', LOOP, true), clip('bump', bump)];
const CHEST_JSON = 'art/world/townlife/hearth_chest.json';
const SIDECARS = Object.freeze({
  hearth_chest_smoke: { id: 'hearth_chest_smoke', class: 'plume', style: 's1', drawn: 'tools/world-art/tower-art.mjs', material: 'native', source: 'hearth_chest_smoke.png',
    frame: [SW, SH], anchor_px: [...SMOKE_ANCHOR], footprint: [1, 1], anims: clipRows(LOOP),
    notes: 'The Hearth Chest\'s smoke (Tyler 2026-11-17, "black / green smoke leaking out"): thin wisps from its seam and a keyhole, a puff when it jolts and dust off the stone when it slams, all the town\'s own smoke (tools/world-art/town-life.mjs smoke) in palette inks. Drawn by tools/world-art/tower-art.mjs; placed by the chest\'s AMBIENT rows (src/data/world/town/sites.js), over it.' },
});
const chestSidecar = () => Object.assign(JSON.parse(readFileSync(join(ROOT, CHEST_JSON), 'utf8')), { anims: [clip('idle', LOOP, true), clip('bump', BUMP.length), clip('flash', FLASH.length)] });
const json = (o) => Buffer.from(JSON.stringify(o, null, 2) + '\n');

/** Every file this tool writes: path -> bytes. */
export function drawAll() {
  const out = new Map();
  out.set('art/world/townlife/hearth_chest.png', encodePNG(drawChest()));
  out.set(CHEST_JSON, json(chestSidecar()));
  out.set('art/world/townlife/hearth_chest_smoke.png', encodePNG(drawSmoke()));
  for (const [id, sc] of Object.entries(SIDECARS)) out.set('art/world/townlife/' + id + '.json', json(sc));
  for (const k of CHEST_KEYS) {
    out.set('assets/ui/tower/chest-open-' + k.id + '.png', encodePNG(drawOpen(k.id)));
    out.set('assets/ui/tower/chest-column-' + k.id + '.png', encodePNG(drawColumn(k.id)));
  }
  return out;
}

function main(argv) {
  const check = argv.includes('--check');
  const missing = CHEST_KEYS.filter((k) => !METALS[k.id]);
  if (missing.length) { console.error('tower-art: no metal for ' + missing.map((k) => k.id).join(', ') + ' (METALS)'); return 1; }
  let stale = 0;
  for (const [rel, bytes] of drawAll()) {
    const file = join(ROOT, rel);
    if (check) {
      let cur = null; try { cur = readFileSync(file); } catch { /* missing */ }
      /* a sidecar by value (a checkout may turn its line ends) */
      const same = cur && (rel.endsWith('.json') ? JSON.stringify(JSON.parse(cur.toString('utf8'))) === JSON.stringify(JSON.parse(bytes.toString('utf8'))) : cur.equals(bytes));
      if (!same) { console.error('stale: ' + rel); stale++; }
    } else { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, bytes); console.log('wrote ' + rel); }
  }
  if (check) console.log(stale ? 'tower-art --check: ' + stale + ' stale' : 'tower-art --check: fresh');
  return stale ? 1 : 0;
}

if (isMain(import.meta.url)) { try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error('tower-art: ' + (e && e.stack || e)); process.exit(2); } }
