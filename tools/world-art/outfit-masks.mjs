#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/outfit-masks.mjs — THE HERO OUTFITS' REGION MASKS, BY SCRIPT
// (lane/c-hero-masks, 2026-11-05: the dye gold sink, board 11-04 "Hero colors"; no generation, $0).
//
// WHAT. For every frame of an outfit's sheet (src/data/hunt-outfits.js OUTFITS, the `hunt` set) one mask
// frame, pixel for pixel: a pixel a dye may recolour is painted its REGION's key, MASK_COLOURS[i] for
// BASE_REGIONS[i] (src/data/outfits.js: head red, body green, legs blue, feet yellow); every other pixel is
// transparent. A hero's colours are one set, head/body/legs/feet, worn across every outfit (board 11-04),
// so every mask keys the same four regions; a region an outfit has no cloth for is simply absent.
// Output: art/world/<mask set>/<sprite>_mask.png + sidecar (the outfit's own layout: frame, anchor, clips,
// facings), built UNLOCKED into assets/world/atlas-<mask set>.* (a mask set: src/data/world/atlas-sets.js
// MASK_SETS, tools/world-art/build.mjs). ONE MASK SET A HERO SET (lane/c-faction-outfit-path 2026-11-18): an
// outfit's sheet is in one of HERO_SETS (`heroes` is full at ATLAS_MAX, so the faction looks are in
// `factionwear`), found by where its sidecar is, and its mask goes to that set's mask set (hunt-masks,
// factionwear-masks). Not in ATLAS_SETS: the dye code loads it on first need, so the
// game's first load does not grow. tests/outfit-masks.mjs holds every mask to its frame.
//
// HOW, per frame, from the outfit's art/world/hunt source sheet:
//   1. MATERIAL  each opaque pixel (alpha >= ALPHA_CUT, the build's cut) is named by the outfit's colour
//                table: the first rule whose hue / saturation / value ranges hold it.
//   2. CUT OUT   a SHIELD (its rim, the largest piece of the rim colour, plus every pixel the rim encloses
//                and the shield colours touching them; seen edge-on, a piece of its colours standing tall
//                above the hip) and a TOOL HEAD (the pixels inside the outline around a blob of steel).
//                Skin, outline, weapons, staffs and glows are never cut: they are just not cloth.
//   3. REGION    each cloth PART is split into PIECES (connected pixels of its materials). A piece takes a
//                fixed region, or the HEIGHT BAND its centre sits in, counted in rows up from the frame's
//                anchor (`bands`: where head / body / legs begin). A whole piece moves as one, so a region
//                boundary follows the art's own outlines and does not slide over the cloth as the walk bobs.
//                A piece that truly spans two bands (a hat touching the robe's shoulder) is split at its
//                narrow links: the piece is eroded by one pixel, each core part takes its centre's band, and
//                the peeled rims and links take their own row's band.
//
// THE SAMPLE (2026-11-05). The knight first, all 56 frames, rendered in four loud colours and read frame
// by frame; then each other outfit the same way. A rule went in only when it removed a flicker seen in a
// frame. What each outfit dyes, and why the rest does not:
//   knight    head plume · body the faulds (the blue cloth under the belt). Plate stays steel: the sword
//             is the same steel and crosses the legs in the east and south walks, and the shield is the
//             faulds' blue and gold.
//   berserker head the helmet and fur mantle · body the red tunic · feet the boots (its legs band stands 7 rows up, or a lifted boot blinks undyed). The leg wraps are the
//             leather of the forearm bracers and the axe hafts and swing with them: no legs.
//   brute     head the cap · body the shirt. The trousers are the hammer head's grey and the hammer swings
//             across them in the north and west walks: no legs; the boots are the trousers' shadow: no feet.
//   ranger    head the hair · legs the blue skirt panel. The white tunic shares its greys with the crossbow
//             held across the chest: no body; the boots blink in and out of the outline: no feet.
//   sorcerer  head the hat · body the robe · feet the boots (hat and robe are one colour: height splits them).
//   witch     head the hat · body the robe · feet the trim (board 11-04: hat, robe, trim -> head, body, feet).
//   dawnward  body the blue cape. The cream tabard is the plate's highlight colour and blinks: not dyed.
//   druid     HELD, no mask: see HELD below.
//
//   node tools/world-art/outfit-masks.mjs              write the sources + sidecars and build atlas-hunt-masks
//   node tools/world-art/outfit-masks.mjs --check      exit 1 when a committed source differs from a fresh run, or a held
//                                                      outfit ships a mask (the atlas's drift is tests/world-assets.mjs's)
//   node tools/world-art/outfit-masks.mjs --out <dir>  write only the sources, under <dir> (a second run, compared by bytes)
//   node tools/world-art/outfit-masks.mjs --report     pixels per region in every walk frame, and each clip's blinks
//   node tools/world-art/outfit-masks.mjs --review <dir>  the review strip: undyed, keys and two dye sets
// Exit 0 green · 1 drift or a build finding · 2 harness error.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG, encodeSheetPNG, createImage, crop, blit, scaleNearest, pixelHash } from './png.mjs';
import { buildSet, stringifyManifest } from './build.mjs';
import { FACINGS, atlasPaths } from '../../src/data/world/art-budget.js';
import { ALPHA_CUT } from '../../src/data/world/palette.js';
import { MASK_SETS, HERO_SETS } from '../../src/data/world/atlas-sets.js';
import { OUTFITS } from '../../src/data/hunt-outfits.js';
import { BASE_REGIONS, MASK_COLOURS, BASE_DEFAULT_COLORS } from '../../src/data/outfits.js';
import { isMain } from '../../tests/_is-main.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Hero set -> its mask set (src/data/world/atlas-sets.js MASK_SETS, read the other way). */
export const MASK_SET_OF = Object.freeze(Object.fromEntries(Object.entries(MASK_SETS).map(([mask, base]) => [base, mask])));
const dirOf = (set) => 'art/world/' + set;
/** The hero set holding a sprite's sheet: the one of HERO_SETS whose source tree has its sidecar (null: none). */
export function heroSetOf(root, sprite) {
  return HERO_SETS.find((set) => existsSync(join(root, dirOf(set), sprite + '.json'))) || null;
}
const HEAD = 0, BODY = 1, LEGS = 2, FEET = 3;
const R = (name) => BASE_REGIONS.indexOf(name);

/* ── THE OUTFITS ─────────────────────────────────────────────────────────────────────────────────────
   materials  [name, { h: [from, to] degrees (wraps past 360), s: [lo, hi], v: [lo, hi] }], first match wins
   bands      rows above the anchor where head, body and legs begin (below `legs` is feet); `byDir` per facing
   shield     { rim, min, grow, tall: { materials, above, minH } }   tool  { materials, min, pad, fill }
   parts      name -> { of (its materials; default [name]), n4 (4-connected pieces; default 8),
                        region (fixed) + where (centre bands it may sit in) | byBand (the centre's band, from
                        this list; clamp folds any other band onto the nearest listed, else the piece is skipped),
                        min (pixels), above / below (its centre at least / under this many rows over the anchor),
                        split (a piece spanning two bands by more than this many rows is split at its links) } */
const OUTLINE = (v) => ['outline', { v: [0, v] }];
export const OUTFIT_MASKS = Object.freeze({
  knight: {
    materials: [OUTLINE(0.14), ['plume', { h: [335, 15], s: [0.45, 1] }], ['blue', { h: [195, 235], s: [0.3, 1] }],
      ['gold', { h: [22, 50], s: [0.4, 1] }], ['steel', { s: [0, 0.3] }]],
    bands: { head: 27, body: 15, legs: 4 },
    shield: { rim: 'gold', min: 25, grow: ['blue'], tall: { materials: ['blue', 'gold'], above: 17, minH: 11 } },
    parts: { plume: { region: 'head', where: ['head'] }, blue: { region: 'body' } },
  },
  berserker: {
    materials: [OUTLINE(0.09), ['red', { h: [350, 12], s: [0.66, 1] }], ['skin', { h: [18, 28], s: [0.4, 0.58], v: [0.72, 1] }],
      ['leather', { h: [10, 26], s: [0.56, 1] }], ['fur', { h: [10, 40], s: [0.08, 0.3], v: [0.2, 0.66] }], ['steel', { s: [0, 0.12], v: [0.6, 1] }]],
    bands: { head: 27, body: 15, legs: 7 },
    parts: { fur: { region: 'head', n4: true, above: 19 }, red: { region: 'body' }, leather: { byBand: ['feet'], n4: true, split: 2 } },
  },
  brute: {
    materials: [OUTLINE(0.09), ['steel', { s: [0, 0.07] }], ['dark', { v: [0, 0.25] }], ['cloth', { h: [24, 55], s: [0.07, 0.26], v: [0.3, 1] }],
      ['skin', { h: [15, 30], s: [0.3, 0.5], v: [0.7, 1] }], ['brown', { h: [10, 35], s: [0.3, 1] }]],
    bands: { head: 30, body: 19, legs: -1 },
    tool: { materials: ['steel'], min: 4, pad: 2, fill: ['cloth', 'dark', 'steel'] },
    parts: { cloth: { byBand: ['head', 'body'], n4: true, split: 3 } },
  },
  ranger: {
    materials: [OUTLINE(0.12), ['blue', { h: [205, 230], s: [0.4, 1] }], ['white', { s: [0, 0.2], v: [0.92, 1] }],
      ['gold', { h: [36, 50], s: [0.45, 1], v: [0.6, 1] }], ['skin', { h: [20, 40], s: [0.2, 0.4], v: [0.75, 1] }],
      ['brown', { h: [18, 36], s: [0.45, 1], v: [0.12, 0.6] }], ['steel', { s: [0, 0.2] }]],
    bands: { head: 27, body: 15, legs: 4 },
    parts: { gold: { byBand: ['head'], n4: true, min: 4 }, blue: { region: 'legs', n4: true, below: 20 } },
  },
  sorcerer: {
    materials: [OUTLINE(0.07), ['glow', { h: [170, 195], s: [0.35, 1], v: [0.7, 1] }], ['glow', { h: [170, 195], s: [0.15, 1], v: [0.88, 1] }],
      ['cloth', { h: [195, 235], s: [0.09, 0.4] }], ['cloth', { s: [0, 0.09], v: [0.38, 0.62] }], ['brown', { h: [15, 40], s: [0.4, 1] }],
      ['cream', { s: [0, 0.3], v: [0.6, 1] }]],
    bands: { head: 26, body: 15, legs: 4 }, byDir: { n: { head: 24 }, ne: { head: 24 }, nw: { head: 24 } },
    parts: { cloth: { byBand: ['head', 'body'], clamp: true, n4: true, min: 2, split: 4 }, brown: { region: 'feet', where: ['feet'], n4: true } },
  },
  witch: {
    materials: [OUTLINE(0.06), ['skin', { h: [10, 30], s: [0.25, 0.56], v: [0.5, 1] }], ['trim', { h: [5, 22], s: [0.72, 1] }],
      ['hat', { h: [300, 0], s: [0.3, 1] }], ['robe', { h: [80, 140], s: [0.2, 1] }], ['brown', { h: [15, 35], s: [0.4, 1] }]],
    bands: { head: 26, body: 15, legs: 4 },
    parts: { hat: { region: 'head' }, robe: { region: 'body' }, trim: { region: 'feet' } },
  },
  dawnward: {
    materials: [OUTLINE(0.1), ['blue', { h: [200, 230], s: [0.35, 1] }], ['gold', { h: [30, 45], s: [0.6, 1] }],
      ['tabard', { h: [30, 55], s: [0.08, 0.25], v: [0.88, 1] }], ['steel', { s: [0, 0.3] }]],
    bands: { head: 27, body: 15, legs: 4 },
    parts: { blue: { region: 'body', n4: true } },
  },
  /* the Sweep's Coat (lane/a-tower-art-gen, 2026-11-16; round 6 redrew it as Tyler's hooded keeper; palette-locked, so its colours are
     exact ramp entries): the soot greys (the shadow ramp's mid steps, the dark stones) are the hood and its torn cape above the shoulders'
     line and the robe below it, height splitting them at their narrow links; the pale ash apron (light stones, bone) under the chest is
     dyed with the boots (the dark earths under the hem), so the regions stay head, body and feet. The gold key and chain, the gold hood
     trim, the singed orange and red edges, the rope sash, the bracers (pale, but above the apron) and the skin are not cloth: no legs. */
  sweeps_coat: {
    materials: [OUTLINE(0.06), ['skin', { h: [15, 35], s: [0.3, 0.5], v: [0.68, 1] }], ['pale', { s: [0, 0.25], v: [0.38, 0.95] }],
      ['grey', { s: [0, 0.3], v: [0.1, 0.36] }], ['leather', { h: [10, 40], s: [0.2, 0.62], v: [0.1, 0.36] }]],
    bands: { head: 24, body: 4, legs: 4 },
    parts: { grey: { byBand: ['head', 'body'], clamp: true, n4: true, min: 2, split: 3 }, pale: { region: 'feet', n4: true, min: 3, below: 16 },
      leather: { byBand: ['feet'], n4: true } },
  },
  /* THE FACTION OUTFITS (lane/b-farm-house-faction-art 2026-11-18, set `factionwear`; palette-locked, so these are exact ramp entries). The
     Flamebearer's antique gold tabard and its trim (the bronze and gold ramps, s >= 0.3: #cfa25c #a8743a #e8c547 #7a4f26 #4a2e18) are its one
     cloth: body. The steel plate, the dark skirt, the pale neck cloth and the flame (bone, s under 0.3) stay as drawn. */
  flamebearer: {
    materials: [OUTLINE(0.1), ['gold', { h: [20, 55], s: [0.3, 1] }], ['steel', { s: [0, 0.3] }]],
    bands: { head: 27, body: 15, legs: 4 },
    parts: { gold: { region: 'body', n4: true } },
  },
  /* The Emberkeeper's crimson cloth at the collar, the sash, the skirt and the striped sleeve (the blood ramp, h 345-15 s >= 0.5: #8e1f1f #5e1a1f
     #3e1216 #c23a2a) is its one cloth: body. The charcoal hood and plate, the iron face plate and the lit eyes (torch, h 33) stay as drawn. */
  emberkeeper: {
    materials: [OUTLINE(0.1), ['crimson', { h: [345, 15], s: [0.5, 1] }], ['eye', { h: [20, 50], s: [0.5, 1] }], ['dark', { s: [0, 0.3] }]],
    bands: { head: 27, body: 15, legs: 4 },
    parts: { crimson: { region: 'body', n4: true } },
  },
});

/* ── HELD: no mask ships; each needs a hand touch-up (not available in this lane) before it can. ──── */
export const HELD = Object.freeze({
  druid: 'the leafy staff is the robe\'s own greens and crosses the body: its leaves merge into the hood in the west walk and '
    + 'blink beside the hood in the south-west and north-east walks. Touch-up: paint the hood and robe keys by hand over the '
    + 'scripted ones on those three walks (18 frames), leaving the staff and its leaves out.',
});

/* ── 1. MATERIAL ─────────────────────────────────────────────────────────────────────────────────── */
function hsv(r, g, b) {
  const R8 = r / 255, G = g / 255, B = b / 255, mx = Math.max(R8, G, B), d = mx - Math.min(R8, G, B);
  let h = 0;
  if (d) h = mx === R8 ? ((G - B) / d + 6) % 6 : mx === G ? (B - R8) / d + 2 : (R8 - G) / d + 4;
  return [h * 60, mx ? d / mx : 0, mx];
}
const inRange = (x, r) => !r || (x >= r[0] && x <= r[1]);
const inHue = (h, r) => !r || (r[0] <= r[1] ? h >= r[0] && h <= r[1] : h >= r[0] || h <= r[1]);
/** The material a colour is, by the outfit's table ('other' when no rule holds it). */
export function materialOf(table, r, g, b) {
  const [h, s, v] = hsv(r, g, b);
  for (const [name, q] of table) if (inHue(h, q.h) && inRange(s, q.s) && inRange(v, q.v)) return name;
  return 'other';
}

/* ── pieces ──────────────────────────────────────────────────────────────────────────────────────── */
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = N4.concat([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
/** Connected pieces of the selected pixels: [{ px, x0, x1, y0, y1, cy }], in scan order. */
function pieces(sel, W, H, steps) {
  const seen = new Uint8Array(W * H), out = [];
  for (let p = 0; p < W * H; p++) {
    if (seen[p] || !sel[p]) continue;
    const px = [p];
    seen[p] = 1;
    for (let k = 0; k < px.length; k++) {
      const x = px[k] % W, y = (px[k] / W) | 0;
      for (const [dx, dy] of steps) {
        const X = x + dx, Y = y + dy, q = Y * W + X;
        if (X >= 0 && Y >= 0 && X < W && Y < H && !seen[q] && sel[q]) { seen[q] = 1; px.push(q); }
      }
    }
    let x0 = W, x1 = -1, y0 = H, y1 = -1, sy = 0;
    for (const q of px) { const x = q % W, y = (q / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); sy += y; }
    out.push({ px, x0, x1, y0, y1, cy: sy / px.length });
  }
  return out;
}

/* ── 2. CUT OUT ──────────────────────────────────────────────────────────────────────────────────── */
function cutShield(mat, cut, W, H, sh, ay) {
  const rims = pieces(mat.map((m) => m === sh.rim), W, H, N8).sort((a, b) => b.px.length - a.px.length);
  const rim = rims.length && rims[0].px.length >= sh.min ? rims[0] : null;
  if (rim) {
    const ring = new Uint8Array(W * H);
    for (const q of rim.px) ring[q] = 1;
    /* everything the frame's edge cannot reach without crossing the rim is enclosed by it */
    const out = new Uint8Array(W * H), st = [];
    const seed = (q) => { if (!ring[q] && !out[q]) { out[q] = 1; st.push(q); } };
    for (let i = 0; i < W; i++) { seed(i); seed((H - 1) * W + i); }
    for (let i = 0; i < H; i++) { seed(i * W); seed(i * W + W - 1); }
    for (let k = 0; k < st.length; k++) {
      const x = st[k] % W, y = (st[k] / W) | 0;
      for (const [dx, dy] of N4) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) seed(Y * W + X); }
    }
    for (let p = 0; p < W * H; p++) if (mat[p] && (ring[p] || !out[p])) cut[p] = 1;
    /* the shield's colours touching the cut shield are shield too (its face beyond a rim that is not closed) */
    for (let grew = true; grew;) {
      grew = false;
      for (let p = 0; p < W * H; p++) {
        if (cut[p] || !sh.grow.includes(mat[p])) continue;
        const x = p % W, y = (p / W) | 0;
        if (N4.some(([dx, dy]) => { const X = x + dx, Y = y + dy, q = Y * W + X; return X >= 0 && Y >= 0 && X < W && Y < H && cut[q] && mat[q] !== 'outline'; })) { cut[p] = 1; grew = true; }
      }
    }
  }
  /* seen edge-on the rim encloses nothing: a piece of the shield's colours standing tall above the hip is the shield */
  const t = sh.tall;
  for (const c of pieces(mat.map((m, p) => t.materials.includes(m) && !cut[p]), W, H, N4)) {
    if (ay - c.y0 > t.above && c.y1 - c.y0 + 1 >= t.minH) for (const q of c.px) cut[q] = 1;
  }
}

function cutTool(mat, cut, W, H, tl) {
  for (const c of pieces(mat.map((m) => tl.materials.includes(m)), W, H, N8)) {
    if (c.px.length < tl.min) continue;
    /* from the steel through the head's own colours, never past `pad` from the steel's box: the head inside its outline */
    const st = c.px.slice();
    for (const q of st) cut[q] = 1;
    for (let k = 0; k < st.length; k++) {
      const x = st[k] % W, y = (st[k] / W) | 0;
      for (const [dx, dy] of N4) {
        const X = x + dx, Y = y + dy, q = Y * W + X;
        if (X < c.x0 - tl.pad || X > c.x1 + tl.pad || Y < c.y0 - tl.pad || Y > c.y1 + tl.pad || X < 0 || Y < 0 || X >= W || Y >= H) continue;
        if (!cut[q] && tl.fill.includes(mat[q])) { cut[q] = 1; st.push(q); }
      }
    }
  }
}

/* ── 3. REGION ───────────────────────────────────────────────────────────────────────────────────── */
/**
 * One frame's regions: an Int8Array, per pixel a BASE_REGIONS index or -1. PURE.
 * @param {{width: number, height: number, data: Uint8Array}} img  one frame of the outfit's source sheet
 * @param {object} spec   an OUTFIT_MASKS row
 * @param {{anchor: number[], dir: string}} at  the sprite's anchor and this frame's facing
 */
export function maskFrame(img, spec, at) {
  const W = img.width, H = img.height, P = W * H;
  const mat = new Array(P).fill(null);
  for (let p = 0; p < P; p++) if (img.data[p * 4 + 3] >= ALPHA_CUT) mat[p] = materialOf(spec.materials, img.data[p * 4], img.data[p * 4 + 1], img.data[p * 4 + 2]);
  const ay = at.anchor[1];
  const cut = new Uint8Array(P);
  if (spec.shield) cutShield(mat, cut, W, H, spec.shield, ay);
  if (spec.tool) cutTool(mat, cut, W, H, spec.tool);
  const b = Object.assign({}, spec.bands, (spec.byDir || {})[at.dir] || {});
  const bandOf = (y) => { const d = ay - y; return d >= b.head ? HEAD : d >= b.body ? BODY : d >= b.legs ? LEGS : FEET; };
  const region = new Int8Array(P).fill(-1);
  for (const [name, part] of Object.entries(spec.parts)) {
    const of = part.of || [name];
    const list = (part.byBand || part.where || BASE_REGIONS).map(R);
    /* a band onto a listed region: itself, the nearest listed when clamping, else none */
    const onto = (band) => (list.includes(band) ? band : part.clamp ? list.reduce((a, c) => (Math.abs(c - band) < Math.abs(a - band) ? c : a), list[0]) : -1);
    for (const c of pieces(mat.map((m, p) => of.includes(m) && !cut[p]), W, H, part.n4 ? N4 : N8)) {
      const centre = bandOf(Math.round(c.cy));
      if (part.min && c.px.length < part.min) continue;
      if (part.above !== undefined && ay - c.cy < part.above) continue;
      if (part.below !== undefined && ay - c.cy >= part.below) continue;
      if (part.region) {
        if (part.where && !list.includes(centre)) continue;
        for (const q of c.px) region[q] = R(part.region);
        continue;
      }
      const whole = onto(centre);
      if (!part.split || bandOf(c.y0 + part.split) === bandOf(c.y1 - part.split)) {
        if (whole >= 0) for (const q of c.px) region[q] = whole;
        continue;
      }
      splitPiece(c, W, part.split, bandOf, onto, region);
    }
  }
  return region;
}

/* A piece spanning two bands: peel its one-pixel rims and links (a 4-neighbour erosion); each core part takes its
   centre's band (a core part that still spans is cut by rows), and every peeled pixel takes its own row's band. */
function splitPiece(c, W, tol, bandOf, onto, region) {
  const inPiece = new Set(c.px);
  const nb = (q) => { const x = q % W, y = (q / W) | 0; return N4.map(([dx, dy]) => (x + dx < 0 || x + dx >= W ? -1 : (y + dy) * W + x + dx)); };
  const core = new Set(c.px.filter((q) => nb(q).every((t) => inPiece.has(t))));
  const seen = new Set(), placed = new Set();
  for (const q0 of c.px) {
    if (!core.has(q0) || seen.has(q0)) continue;
    const part = [q0];
    seen.add(q0);
    for (let k = 0; k < part.length; k++) for (const t of nb(part[k])) if (core.has(t) && !seen.has(t)) { seen.add(t); part.push(t); }
    if (part.length < 3) continue;   // a speck of core is a rim: it takes its row, below
    const ys = part.map((q) => (q / W) | 0);
    const cy = ys.reduce((s, y) => s + y, 0) / ys.length;
    const spans = bandOf(Math.min(...ys) + tol) !== bandOf(Math.max(...ys) - tol);
    part.forEach((q, k) => { placed.add(q); const r = onto(spans ? bandOf(ys[k]) : bandOf(Math.round(cy))); if (r >= 0) region[q] = r; });
  }
  for (const q of c.px) {
    if (placed.has(q)) continue;
    const r = onto(bandOf((q / W) | 0));
    if (r >= 0) region[q] = r;
  }
}

/* ── THE SHEETS ──────────────────────────────────────────────────────────────────────────────────── */
/** The (anim, facing, frame) of each frame cell of a sidecar's sheet, in build.mjs framesOf order. */
export function cellsOf(sc, [fw, fh]) {
  const out = [];
  let row = 0;
  for (const a of sc.anims) for (const d of FACINGS) {
    if (!a.dirs[d]) continue;
    for (let i = 0; i < a.dirs[d]; i++) out.push({ anim: a.name, dir: d, i, x: i * fw, y: row * fh });
    row++;
  }
  return out;
}

const sidecarOf = (root, set, sprite) => JSON.parse(readFileSync(join(root, dirOf(set), sprite + '.json'), 'utf8'));
const FRAME = [64, 64];

/** One outfit's mask sheet, the same size and layout as its source sheet. PURE over its inputs. */
export function maskSheet(sheet, sc, spec) {
  const out = createImage(sheet.width, sheet.height);
  for (const cell of cellsOf(sc, FRAME)) {
    const region = maskFrame(crop(sheet, cell.x, cell.y, FRAME[0], FRAME[1]), spec, { anchor: sc.anchor_px, dir: cell.dir });
    for (let p = 0; p < region.length; p++) {
      if (region[p] < 0) continue;
      const i = ((cell.y + ((p / FRAME[0]) | 0)) * sheet.width + cell.x + (p % FRAME[0])) * 4;
      out.data.set(MASK_COLOURS[region[p]], i);
      out.data[i + 3] = 255;
    }
  }
  return out;
}

/** Every shipped mask: [{ outfit, sprite, id, base, set, sidecar, image }] from the tree's sources (`base` the hero set, `set` its mask set). */
export function buildMasks(root = ROOT) {
  return Object.entries(OUTFIT_MASKS).map(([outfit, spec]) => {
    const sprite = OUTFITS[outfit];
    const base = heroSetOf(root, sprite);
    if (!base || !MASK_SET_OF[base]) throw new Error('outfit-masks: ' + sprite + ' is in no hero set with a mask set (src/data/world/atlas-sets.js HERO_SETS, MASK_SETS)');
    const sc = sidecarOf(root, base, sprite);
    const image = maskSheet(decodePNG(readFileSync(join(root, dirOf(base), sc.source))), sc, spec);
    const id = sprite + '_mask';
    const sidecar = { id, class: sc.class, mask_of: sprite, source: id + '.png', anchor_px: sc.anchor_px, footprint: sc.footprint, anims: sc.anims,
      notes: 'Region mask of ' + sprite + ' (dyes): each pixel a dye recolours keyed by region, src/data/outfits.js MASK_COLOURS in BASE_REGIONS order. '
        + 'Written by tools/world-art/outfit-masks.mjs from ' + dirOf(base) + '/' + sc.source + '; free, no generation.' };
    return { outfit, sprite, id, base, set: MASK_SET_OF[base], sidecar, image };
  });
}

/* each mask under its own mask set's directory, below `root` */
function writeSources(root, masks) {
  for (const m of masks) {
    const dir = dirOf(m.set);
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, m.id + '.png'), encodePNG(m.image));
    writeFileSync(join(root, dir, m.id + '.json'), JSON.stringify(m.sidecar, null, 2) + '\n');
  }
}

/* ── --report: pixels per region per walk frame; a region present in some frames of a clip and absent in others blinks ── */
function report(masks) {
  for (const m of masks) {
    for (const d of FACINGS) {
      const cells = cellsOf(m.sidecar, FRAME).filter((c) => c.anim === 'walk' && c.dir === d);
      const counts = cells.map((c) => {
        const n = [0, 0, 0, 0];
        for (let y = 0; y < FRAME[1]; y++) for (let x = 0; x < FRAME[0]; x++) {
          const i = ((c.y + y) * m.image.width + c.x + x) * 4;
          if (m.image.data[i + 3]) n[MASK_COLOURS.findIndex((k) => k[0] === m.image.data[i] && k[1] === m.image.data[i + 1] && k[2] === m.image.data[i + 2])]++;
        }
        return n;
      });
      const blinks = BASE_REGIONS.filter((_, r) => counts.some((n) => n[r]) && counts.some((n) => !n[r]));
      console.log(`${m.outfit.padEnd(9)} walk ${d.padEnd(2)} ` + BASE_REGIONS.map((g, r) => g + ' ' + counts.map((n) => String(n[r]).padStart(3)).join('')).join(' | ')
        + (blinks.length ? '   blinks: ' + blinks.join(', ') : ''));
    }
  }
}

/* ── --review: per outfit, walk frames undyed | keys | dye set A | dye set B, at x3 ───────────────── */
/* The recolour of src/render/outfit-sprite.js recolourPixels (keep the value, take the dye's hue and saturation),
   restated here so the strip shows what the Character window would draw; that module is the truth. */
function dyed(rgb, hex) {
  const t = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [h, s, v] = hsv(t[0], t[1], t[2]);
  const val = (Math.max(...rgb) / 255) * (0.4 + 0.6 * v);
  const c = val * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = val - c, k = Math.floor(h / 60) % 6;
  return [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k].map((u) => Math.round((u + m) * 255));
}
function dyeTokens(root) {
  const css = readFileSync(join(root, 'src/styles/tokens.css'), 'utf8');
  return Object.fromEntries([...css.matchAll(/--dye-(\d+):\s*(#[0-9a-f]{6})/gi)].map((m) => [+m[1], m[2]]));
}
const REVIEW_FRAMES = [['walk', 's', 0], ['walk', 's', 3], ['walk', 'e', 1], ['walk', 'n', 2], ['walk', 'w', 4], ['walk', 'se', 2]];
export function reviewStrip(root, masks) {
  const dye = dyeTokens(root);
  const SETS = [BASE_REGIONS.map((g) => dye[BASE_DEFAULT_COLORS[g]]), [dye[11], dye[7], dye[14], dye[6]]];   // the creation defaults; green, amber, sky, red
  const K = 3, CW = 40, CH = 46, X0 = 12, Y0 = 14, GAP = 4;
  const cols = 4 * REVIEW_FRAMES.length, rows = Object.keys(OUTFITS);
  const out = createImage(cols * CW * K + 3 * GAP * K, rows.length * CH * K);
  for (let i = 0; i < out.data.length; i += 4) out.data.set([74, 78, 70, 255], i);
  rows.forEach((outfit, r) => {
    const sprite = OUTFITS[outfit], base = heroSetOf(root, sprite), sc = sidecarOf(root, base, sprite), sheet = decodePNG(readFileSync(join(root, dirOf(base), sc.source)));
    const mask = (masks.find((m) => m.outfit === outfit) || {}).image || null;
    const cells = cellsOf(sc, FRAME);
    REVIEW_FRAMES.forEach(([anim, dir, i], f) => {
      const cell = cells.find((c) => c.anim === anim && c.dir === dir && c.i === i);
      for (let v = 0; v < 4; v++) {
        const tile = crop(sheet, cell.x + X0, cell.y + Y0, CW, CH);
        const keys = mask ? crop(mask, cell.x + X0, cell.y + Y0, CW, CH) : null;
        for (let p = 0; p < CW * CH * 4; p += 4) {
          if (!tile.data[p + 3]) continue;
          if (v === 0) continue;
          const k = keys && keys.data[p + 3] ? MASK_COLOURS.findIndex((c) => c[0] === keys.data[p] && c[1] === keys.data[p + 1] && c[2] === keys.data[p + 2]) : -1;
          if (v === 1) { if (k >= 0) tile.data.set(MASK_COLOURS[k], p); else { const g = Math.round((tile.data[p] + tile.data[p + 1] + tile.data[p + 2]) / 6); tile.data.set([g, g, g], p); } }
          else if (k >= 0) tile.data.set(dyed([tile.data[p], tile.data[p + 1], tile.data[p + 2]], SETS[v - 2][k]), p);
        }
        const big = scaleNearest(tile, K);
        blit(out, big, 0, 0, big.width, big.height, (v * REVIEW_FRAMES.length + f) * CW * K + v * GAP * K, r * CH * K, true);
      }
    });
  });
  return out;
}

/* ── main ────────────────────────────────────────────────────────────────────────────────────────── */
function main(argv) {
  const masks = buildMasks(ROOT);
  if (argv.includes('--report')) { report(masks); return 0; }
  const at = argv.indexOf('--review');
  if (at >= 0) {
    const dir = argv[at + 1];
    mkdirSync(join(ROOT, dir), { recursive: true });
    writeFileSync(join(ROOT, dir, 'outfit-masks-review.png'), encodePNG(reviewStrip(ROOT, masks)));
    console.log('wrote ' + dir + '/outfit-masks-review.png');
    return 0;
  }
  const out = argv.indexOf('--out');
  if (out >= 0) { writeSources(resolve(argv[out + 1]), masks); console.log('wrote ' + masks.length + ' masks under ' + argv[out + 1]); return 0; }
  if (argv.includes('--check')) {
    let stale = 0;
    for (const m of masks) {
      const dir = dirOf(m.set);
      let have = null, side = null;
      try { have = pixelHash(decodePNG(readFileSync(join(ROOT, dir, m.id + '.png')))); side = readFileSync(join(ROOT, dir, m.id + '.json'), 'utf8'); } catch { /* absent */ }
      if (have !== pixelHash(m.image) || side !== JSON.stringify(m.sidecar, null, 2) + '\n') { console.error('stale: ' + dir + '/' + m.id); stale++; }
    }
    for (const outfit of Object.keys(HELD)) {
      const base = heroSetOf(ROOT, OUTFITS[outfit]);
      if (base && MASK_SET_OF[base] && existsSync(join(ROOT, dirOf(MASK_SET_OF[base]), OUTFITS[outfit] + '_mask.png'))) { console.error('held but shipped: ' + outfit); stale++; }
    }
    console.log(stale ? `outfit-masks --check: RED, ${stale} stale` : `outfit-masks --check: ${masks.length} masks match a fresh run`);
    return stale ? 1 : 0;
  }
  writeSources(ROOT, masks);
  for (const set of Object.keys(MASK_SETS)) {
    const b = buildSet(ROOT, set);
    for (const f of b.findings) console.log(`  ✗ [${f.rule}] ${f.id}: ${f.detail}`);
    if (b.findings.length) return 1;
    const p = atlasPaths(set);
    writeFileSync(join(ROOT, p.image), encodeSheetPNG(b.atlas));
    writeFileSync(join(ROOT, p.manifest), stringifyManifest(b.manifest) + '\n');
    console.log(`wrote ${masks.filter((m) => m.set === set).length} masks under ${dirOf(set)} and ${p.image} (${b.manifest.size.join('x')})`);
  }
  console.log(`held: ${Object.keys(HELD).join(', ') || 'none'}`);
  return 0;
}

if (isMain(import.meta.url)) {
  try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error('outfit-masks: harness error:', e && e.stack || e); process.exit(2); }
}
