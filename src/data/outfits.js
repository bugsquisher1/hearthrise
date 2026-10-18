// ════════════════════════════════════════════════════════════════════════
// src/data/outfits.js — THE OUTFITS A HERO CAN WEAR, AND THE DYES.
//
// The sprite of each outfit is src/data/hunt-outfits.js OUTFITS (one look in
// town and in a hunt); this file adds what the Character window and the
// server need about it:
//   label     its name
//   premium   owned while the character's premium is active (PREMIUM_PERKS.outfits);
//             a free outfit is everyone's. Ownership is the SERVER's (hr_outfit_owned).
//   regions   the parts its art's region masks define, in picker order. An outfit
//             recolours only once its mask frames are in the art set (the picker
//             is shown only then, src/shell/windows/character/outfit.js).
// DYES are the colours a region may take: each is a colour of the world palette
// (art/world/palette.json), so a dyed outfit stays inside it. A saved colour is
// an INDEX into this list; the server checks it against hr_outfit_dyes.
// The rows here and the server's (supabase/migrations/2026-10-25-character-sheet.sql)
// are compared by tests/character-window.mjs (CW-D1): edit both together.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { OUTFITS } from './hunt-outfits.js?v=0.2.0';

export const OUTFIT_ROWS = Object.freeze({
  knight: Object.freeze({ label: 'Knight', premium: false, regions: Object.freeze([]) }),
  berserker: Object.freeze({ label: 'Berserker', premium: false, regions: Object.freeze([]) }),
  ranger: Object.freeze({ label: 'Ranger', premium: false, regions: Object.freeze([]) }),
  sorcerer: Object.freeze({ label: 'Sorcerer', premium: false, regions: Object.freeze([]) }),
  druid: Object.freeze({ label: 'Druid', premium: false, regions: Object.freeze([]) }),
  brute: Object.freeze({ label: 'Quarry Brute', premium: true, regions: Object.freeze([]) }),
  witch: Object.freeze({ label: 'Hedge Witch', premium: true, regions: Object.freeze(['hat', 'robe', 'trim']) }),
  dawnward: Object.freeze({ label: 'Dawnward', premium: true, regions: Object.freeze([]) }),
});

/* A region's name in the picker. */
export const REGION_LABEL = Object.freeze({ hat: 'Hat', robe: 'Robe', trim: 'Trim', head: 'Head', body: 'Body', legs: 'Legs', feet: 'Feet' });

/* Index → colour. Every one is a world palette colour (tests/character-window.mjs CW-D2). */
export const DYES = Object.freeze([
  '#2f2723', '#6a6865', '#e6dcbc', '#8a6440',
  '#a8743a', '#5e1a1f', '#c23a2a', '#f2a03a',
  '#e8c547', '#6b7a38', '#3d6234', '#7ccf4a',
  '#4f7a80', '#2b4a6a', '#4fa8e8', '#5c6c7a',
]);

/* A region mask's colours: region i of an outfit's `regions` is painted MASK_COLOURS[i] in its mask art. */
export const MASK_COLOURS = Object.freeze([[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]]);

/** The outfit ids in display order. */
export const OUTFIT_IDS = Object.freeze(Object.keys(OUTFIT_ROWS));

/** Every problem with the table, as strings. Empty = valid. */
export function validate() {
  const out = [];
  for (const id of OUTFIT_IDS) if (!OUTFITS[id]) out.push(id + ': no sprite in hunt-outfits.js OUTFITS');
  for (const id of Object.keys(OUTFITS)) if (!OUTFIT_ROWS[id]) out.push(id + ': a sprite with no outfit row');
  for (const [id, r] of Object.entries(OUTFIT_ROWS)) {
    if (typeof r.label !== 'string' || !r.label) out.push(id + ': no label');
    if (typeof r.premium !== 'boolean') out.push(id + ': premium must be true or false');
    for (const g of r.regions) if (!REGION_LABEL[g]) out.push(id + ': region ' + g + ' has no label');
    if (r.regions.length > MASK_COLOURS.length) out.push(id + ': more regions than mask colours');
  }
  if (!DYES.every((h) => /^#[0-9a-f]{6}$/.test(h)) || new Set(DYES).size !== DYES.length) out.push('DYES must be distinct #rrggbb colours');
  return out;
}
