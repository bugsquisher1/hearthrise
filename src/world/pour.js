// ════════════════════════════════════════════════════════════════════════
// src/world/pour.js — A RAMP POUR: ONE SPRITE'S PALETTE PIXELS RE-POURED ONTO ANOTHER LADDER OF THE SAME PALETTE (lane/a-tower-art).
//
// The Burning Tower's fire tint (Tyler 2026-11-14, the board's "The Burning Tower" §1: "a fire tint for monsters that already exist").
// It is the art pipeline's ramp re-pour (tools/world-art/import-barrow-2026-11-14.mjs pourOnto: every pixel by its value onto a ladder of
// palette colours), done when a sprite is first drawn in the Tower instead of shipped as a second sheet: the Tower's 49 kinds live in 14
// sets, about ten more 2048 atlases as copies, and a floor draws five. It is NOT a tint (ART_DIRECTION §2): every colour in and out is
// one of the 56 of hr-world-56-v2 (tools/world-art/tower-pours.mjs --check holds every ladder to art/world/palette.json), nothing
// blends, nothing is partial, and the outline stays the outline.
//
// THE RULE, simple enough to publish. A pour reads the whole sprite (every frame) once, so no frame glows where its neighbour doesn't.
//   1. The sprite's colours, lightest first: whole colours from the top glow, by how much of the body lies above them (`glow`: the
//      lightest 3% white-hot, to 8% flame, to 14% ember red), until one colour would carry the glow past `glowMax`.
//   2. Every other colour goes onto the ladder by its rank in the body (its pixels' midpoint share, darkest first), so a dark rat and a
//      bone wight both use the whole ladder and keep every shading step they had.
//   char    the fire remembers what it ate: a charred body (shadow and the darkest earths) with its lightest edges burning. Read on the
//           flue's pale ash floor (the Pyre Field's rule, ART_DIRECTION §4: a bright floor, dark bodies), 3:1 by its ring.
//   keeper  a landing's Keeper: coal-red, and twice as much of it alight, so it is the hottest thing in the room.
//
// PURE: RGBA in, RGBA out (in place). No DOM. Node (tools/world-art/tower-pours.mjs) and the browser (monster-pour.js) share it.
// ════════════════════════════════════════════════════════════════════════

import { PALETTE_RGB } from '../data/world/palette.js?v=0.2.137';

/* The opacity cut of the world's art (src/data/world/palette.js ALPHA_CUT): the art has no partial alpha. */
const OPAQUE = 128;
/* The outline colour (the palette's darkest, `shadow` 0): never poured. */
const hexOf = (n) => '#' + n.toString(16).padStart(6, '0');
export const OUTLINE = hexOf(PALETTE_RGB.outline);

/** THE POURS: a body ladder (dark to light) and the glow's tiers [share of the body at or above, colour]. Every colour is hr-world-56-v2's. */
export const POURS = Object.freeze({
  char: Object.freeze({
    /* shadow 1-3, earth 0-1: soot to scorched */
    ladder: Object.freeze(PALETTE_RGB.soot.map(hexOf)),
    glow: Object.freeze([[0.03, hexOf(PALETTE_RGB.glow.hot)], [0.08, hexOf(PALETTE_RGB.glow.flame)], [0.14, hexOf(PALETTE_RGB.glow.ember)]]),
    glowMax: 0.2,
  }),
  keeper: Object.freeze({
    /* shadow 1, cloth 0-1, blood 0: coal red */
    ladder: Object.freeze(PALETTE_RGB.coal.map(hexOf)),
    glow: Object.freeze([[0.06, hexOf(PALETTE_RGB.glow.hot)], [0.16, hexOf(PALETTE_RGB.glow.flame)], [0.28, hexOf(PALETTE_RGB.glow.ember)]]),
    glowMax: 0.34,
  }),
  /* THE GREAT HEARTH'S SMOKE (2027-05-05-hearth-moods.sql): `smoke_<flame>`, the flue's plume poured onto that flame's ladder (palette.js
     PALETTE_RGB.smoke), no glow. src/world/hearth-burn.js names the pour for the flame the square burns. */
  ...Object.fromEntries(Object.entries(PALETTE_RGB.smoke).map(([flame, ladder]) => ['smoke_' + flame,
    Object.freeze({ ladder: Object.freeze(ladder.map(hexOf)), glow: Object.freeze([]), glowMax: 0 })])),
});

const hex2 = (n) => (n < 16 ? '0' : '') + n.toString(16);
const rgbOf = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
/** CIE L* (0..100) of an sRGB colour: the value a pour orders by. */
export function lightness(r, g, b) {
  const y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

/**
 * THE POUR'S MAP FOR ONE SPRITE: every colour its opaque pixels use -> the colour it becomes, from the counts of the whole sprite.
 * @param {Map<string, number>} counts  '#rrggbb' -> how many opaque pixels of the sprite have it
 * @param {string} name  a key of POURS
 * @returns {Map<string, string>}
 */
function pourMap(counts, name) {
  const p = POURS[name];
  if (!p) throw new Error('pour: no pour ' + name);
  const body = [...counts.entries()].filter(([h]) => h !== OUTLINE).map(([h, n]) => ({ h, n, l: lightness(...rgbOf(h)) }))
    .sort((a, b) => b.l - a.l || (a.h < b.h ? -1 : 1));
  const total = body.reduce((s, c) => s + c.n, 0);
  const out = new Map([[OUTLINE, OUTLINE]]);
  if (!total) return out;
  /* 1. the glow, from the lightest down */
  let above = 0, k = 0;
  for (; k < body.length; k++) {
    const c = body[k];
    const tier = p.glow.find(([share]) => above / total < share);
    if (!tier || (above + c.n) / total > p.glowMax) break;
    out.set(c.h, tier[1]);
    above += c.n;
  }
  /* 2. the rest by rank, darkest first */
  const rest = body.slice(k).reverse();
  const left = rest.reduce((s, c) => s + c.n, 0);
  let below = 0;
  for (const c of rest) {
    const mid = (below + c.n / 2) / left;
    out.set(c.h, p.ladder[Math.min(p.ladder.length - 1, Math.floor(mid * p.ladder.length))]);
    below += c.n;
  }
  return out;
}

/** The opaque colours of RGBA pixels, counted. Pure. */
function countColours(px) {
  const counts = new Map();
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < OPAQUE) continue;
    const h = '#' + hex2(px[i]) + hex2(px[i + 1]) + hex2(px[i + 2]);
    counts.set(h, (counts.get(h) || 0) + 1);
  }
  return counts;
}

/** Pour RGBA pixels `px` (one whole sprite) in place by pour `name`. Returns px. */
export function pourPixels(px, name) {
  const map = pourMap(countColours(px), name);
  const rgb = new Map([...map].map(([k, v]) => [k, rgbOf(v)]));
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < OPAQUE) continue;
    const to = rgb.get('#' + hex2(px[i]) + hex2(px[i + 1]) + hex2(px[i + 2]));
    if (to) { px[i] = to[0]; px[i + 1] = to[1]; px[i + 2] = to[2]; }
  }
  return px;
}
