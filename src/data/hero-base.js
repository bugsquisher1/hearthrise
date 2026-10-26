// ════════════════════════════════════════════════════════════════════════
// src/data/hero-base.js — THE STANDARD HERO, AS A REGION MAP (Tyler 2026-10-20).
//
// One base model with four recolour regions (Head, Body, Legs, Feet;
// src/data/outfits.js BASE_REGIONS). Each cell names what it is, never a
// colour: the creation step (src/app/hero-create.js) paints a region with the
// dye the player picked, its shade a darker step of the same dye, and the skin
// and outline with the --hero-* tokens (src/styles/tokens.css). Drawn at an
// integer scale only.
//
// LEGEND
//   .  empty           o  outline        e  eye (outline colour)
//   s  skin            S  skin shade
//   h/H head  b/B body  l/L legs  f/F feet   (lower case = the dye, upper = its shade)
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { BASE_REGIONS } from './outfits.js?v=0.2.50';

export const HERO_BASE_W = 16;
export const HERO_BASE_H = 24;

/* Front view, south-facing, rows top to bottom. */
export const HERO_BASE_ROWS = Object.freeze([
  '......oooo......',
  '....oohhhhoo....',
  '...ohhhhhhhHo...',
  '..ohhhhhhhhhHo..',
  '..oHhhhhhhhHHo..',
  '..oHssssssssHo..',
  '...osesssseso...',
  '...osssssssSo...',
  '....oSssssSo....',
  '...oooooooooo...',
  '..obbbbbbbbbBo..',
  '.obbbbbbbbbbbBo.',
  '.obbobbbbbbobBo.',
  '.obbobbbbbbobBo.',
  '.obbobbbbbbobBo.',
  '.ossobbbbbbosSo.',
  '..oooBBBBBBooo..',
  '....ollllllo....',
  '....olllLllo....',
  '....olllolLo....',
  '....olllolLo....',
  '....offfoffo....',
  '...offffoffFo...',
  '...oooooooooo...',
]);

/* cell -> { region (a BASE_REGIONS id) and shade } or { token (a --hero-* name) }. */
export const HERO_BASE_LEGEND = Object.freeze({
  o: Object.freeze({ token: 'hero-outline' }),
  e: Object.freeze({ token: 'hero-outline' }),
  s: Object.freeze({ token: 'hero-skin' }),
  S: Object.freeze({ token: 'hero-skin-shade' }),
  h: Object.freeze({ region: 'head', shade: false }),
  H: Object.freeze({ region: 'head', shade: true }),
  b: Object.freeze({ region: 'body', shade: false }),
  B: Object.freeze({ region: 'body', shade: true }),
  l: Object.freeze({ region: 'legs', shade: false }),
  L: Object.freeze({ region: 'legs', shade: true }),
  f: Object.freeze({ region: 'feet', shade: false }),
  F: Object.freeze({ region: 'feet', shade: true }),
});

/* A shade is the dye's colour at this share of its value (whole per mille). */
export const HERO_SHADE_PERMILLE = 680;

/** Every problem with the map, as strings. Empty = valid. */
export function validate() {
  const out = [];
  if (HERO_BASE_ROWS.length !== HERO_BASE_H) out.push('the map has ' + HERO_BASE_ROWS.length + ' rows, not ' + HERO_BASE_H);
  const seen = new Set();
  HERO_BASE_ROWS.forEach((r, y) => {
    if (r.length !== HERO_BASE_W) out.push('row ' + y + ' is ' + r.length + ' wide, not ' + HERO_BASE_W);
    for (const c of r) if (c !== '.' && !HERO_BASE_LEGEND[c]) out.push('row ' + y + ' holds an unknown cell ' + c);
    for (const c of r) { const l = HERO_BASE_LEGEND[c]; if (l && l.region) seen.add(l.region); }
  });
  for (const g of BASE_REGIONS) if (!seen.has(g)) out.push('region ' + g + ' paints no cell');
  for (const l of Object.values(HERO_BASE_LEGEND)) if (l.region && !BASE_REGIONS.includes(l.region)) out.push('legend names an unknown region ' + l.region);
  return out;
}
