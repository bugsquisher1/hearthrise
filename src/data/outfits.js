// ════════════════════════════════════════════════════════════════════════
// src/data/outfits.js — THE OUTFITS A HERO CAN WEAR, AND THE DYES.
//
// The sprite of each outfit is src/data/hunt-outfits.js OUTFITS (one look in
// town and in a hunt); this file adds what the Character window and the
// server need about it:
//   label     its name: what the clothes ARE, never a role or class word
//             (designer 2026-10-22: "Knight, Ranger, Sorcerer, Druid" read as a
//             class pick at creation's next screen; a look changes nothing, the
//             weapon is the role. The ids stay: the server keys on them.)
//   premium   owned while the character's premium is active (PREMIUM_PERKS.outfits);
//             a free outfit is everyone's. Ownership is the SERVER's (hr_outfit_owned).
//   regions   the parts its art's region masks define, in picker order. An outfit
//             recolours only once its mask frames are in the art set (the picker
//             is shown only then, src/shell/windows/character/outfit.js).
// DYES are the colours a region may take: DYE_COUNT tokens --dye-N in
// src/styles/tokens.css, each a colour of the world palette, so a dyed outfit
// stays inside it. A saved colour is an INDEX; the server checks it against
// hr_outfit_dyes.
// The rows here and the server's (supabase/migrations/2026-10-25-character-sheet.sql)
// are compared by tests/character-window.mjs (CW-D1): edit both together.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { OUTFITS } from './hunt-outfits.js?v=0.2.54';

export const OUTFIT_ROWS = Object.freeze({
  knight: Object.freeze({ label: 'Plate Harness', premium: false, regions: Object.freeze([]) }),
  berserker: Object.freeze({ label: 'Fur Wraps', premium: false, regions: Object.freeze([]) }),
  ranger: Object.freeze({ label: 'Hooded Leathers', premium: false, regions: Object.freeze([]) }),
  sorcerer: Object.freeze({ label: 'Scholar’s Robe', premium: false, regions: Object.freeze([]) }),
  druid: Object.freeze({ label: 'Grove Robe', premium: false, regions: Object.freeze([]) }),
  brute: Object.freeze({ label: 'Quarry Brute', premium: true, regions: Object.freeze([]) }),
  witch: Object.freeze({ label: 'Hedge Witch', premium: true, regions: Object.freeze(['hat', 'robe', 'trim']) }),
  dawnward: Object.freeze({ label: 'Dawnward', premium: true, regions: Object.freeze([]) }),
});

/* A region's name in the picker. */
export const REGION_LABEL = Object.freeze({ hat: 'Hat', robe: 'Robe', trim: 'Trim', head: 'Head', body: 'Body', legs: 'Legs', feet: 'Feet' });

/* THE STANDARD HERO's recolour regions, in picker order (Tyler 2026-10-20: a new hero picks a
   colour for each at creation). The server's hr_base_regions() (2026-11-02-hero-creation.sql) is
   held equal by tests/hero-creation.mjs. A saved colour is a dye INDEX, like an outfit's. */
export const BASE_REGIONS = Object.freeze(['head', 'body', 'legs', 'feet']);

/* The colours the creation step opens on (dye indices): a blue hood, a red tunic, brown legs, dark boots. */
export const BASE_DEFAULT_COLORS = Object.freeze({ head: 13, body: 5, legs: 3, feet: 0 });

/* How many dyes there are. Dye N's colour is the token --dye-N (src/styles/tokens.css):
   each a world palette colour, held equal to the server's rows by tests/character-window.mjs. */
export const DYE_COUNT = 16;

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
  if (!Number.isInteger(DYE_COUNT) || DYE_COUNT < 1 || DYE_COUNT > 64) out.push('DYE_COUNT must be 1..64');
  for (const g of BASE_REGIONS) {
    if (!REGION_LABEL[g]) out.push('base region ' + g + ' has no label');
    const d = BASE_DEFAULT_COLORS[g];
    if (!Number.isInteger(d) || d < 0 || d >= DYE_COUNT) out.push('base region ' + g + ' opens on no dye');
  }
  return out;
}
