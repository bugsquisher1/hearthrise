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
//   regions   which of the hero's four colors this outfit's art can show, in picker
//             order: exactly the regions its mask keys (tests/hero-colors.mjs reads the
//             art). A hero's colors are ONE set, worn across every outfit (board 11-04).
//   parts     what each of those regions IS on this outfit: the word the picker shows,
//             so the free try-on says exactly what a paid save changes here.
//   plain     an outfit with no regions says why (the druid: the mask lane held it).
// DYES are the colours a region may take: DYE_COUNT tokens --dye-N in
// src/styles/tokens.css, each a colour of the world palette. A saved colour is an
// INDEX; the server checks it against hr_outfit_dyes.
// The server's rows are generated from these (tools/gen-outfits.mjs --check, held by
// tests/character-window.mjs CW-D1): regenerate after any edit.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { OUTFITS } from './hunt-outfits.js?v=0.2.115';

const row = (label, premium, parts, plain) => Object.freeze({
  label, premium, regions: Object.freeze(Object.keys(parts)), parts: Object.freeze(parts), plain: plain || null,
});

export const OUTFIT_ROWS = Object.freeze({
  knight: row('Plate Harness', false, { head: 'Plume', body: 'Waist cloth' }),
  berserker: row('Fur Wraps', false, { head: 'Helmet', body: 'Tunic', feet: 'Boots' }),
  ranger: row('Hooded Leathers', false, { head: 'Hair', legs: 'Skirt panel' }),
  sorcerer: row('Scholar’s Robe', false, { head: 'Hat', body: 'Robe', feet: 'Boots' }),
  druid: row('Grove Robe', false, {}, 'The Grove Robe keeps its own green. Its staff leaves are the same green as the cloth, so a dye would change both. Your colors stay saved and show on every other outfit.'),
  brute: row('Quarry Brute', true, { head: 'Cap', body: 'Shirt' }),
  witch: row('Hedge Witch', true, { head: 'Hat', body: 'Robe', feet: 'Trim' }),
  dawnward: row('Dawnward', true, { body: 'Cape' }),
});

/* A region's name in the creation step. */
export const REGION_LABEL = Object.freeze({ head: 'Head', body: 'Body', legs: 'Legs', feet: 'Feet' });

/* THE COLORS ARE SHOWN (lane/c-hero-colors, 2026-11-05): the World draws dyes in town and in hunts (src/world/hero-dye.js) and the creation step previews the real
   sprite. When false, the step shows no strips and no preview and a new hero takes BASE_DEFAULT_COLORS (CLAUDE.md §3.5, half-built stays hidden). */
export const HERO_DYES_SHOWN = true;

/* THE HERO's recolour regions, in picker order (Tyler 2026-10-20: a new hero picks a colour for each at creation; board 11-04: one set, worn across every
   outfit). The server's hr_base_regions() (2026-11-02-hero-creation.sql) is held equal by tests/hero-creation.mjs. A saved colour is a dye INDEX. */
export const BASE_REGIONS = Object.freeze(['head', 'body', 'legs', 'feet']);

/* The colours the creation step opens on (dye indices): a blue hood, a red tunic, brown legs, dark boots. */
export const BASE_DEFAULT_COLORS = Object.freeze({ head: 13, body: 5, legs: 3, feet: 0 });

/* How many dyes there are. Dye N's colour is the token --dye-N (src/styles/tokens.css):
   each a world palette colour, held equal to the server's rows by tests/character-window.mjs. */
export const DYE_COUNT = 16;

/* A region mask's colours: region BASE_REGIONS[i] is painted MASK_COLOURS[i] in the mask art, whatever the outfit. */
export const MASK_COLOURS = Object.freeze([[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]]);

/**
 * A hero's four colors as the look's key, "head.body.legs.feet", or null when the server sent no whole set of dye indices (drawn undyed, never guessed). Pure.
 * @param {*} c  { head, body, legs, feet }
 */
export function dyeKeyOf(c) {
  if (!c || typeof c !== 'object') return null;
  const { head, body, legs, feet } = c;
  for (const v of [head, body, legs, feet]) if (!Number.isInteger(v) || v < 0 || v >= DYE_COUNT) return null;
  return head + '.' + body + '.' + legs + '.' + feet;
}

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
    for (const g of r.regions) {
      if (!BASE_REGIONS.includes(g)) out.push(id + ': region ' + g + ' is not one of the hero\'s four');
      if (typeof r.parts[g] !== 'string' || !r.parts[g]) out.push(id + ': region ' + g + ' does not say what it is');
    }
    if (!r.regions.length && !r.plain) out.push(id + ': no regions, and no words saying why');
    if (r.regions.length && r.plain) out.push(id + ': it has regions, and words saying it has none');
  }
  if (BASE_REGIONS.length !== MASK_COLOURS.length) out.push('a mask key for each of the hero\'s regions');
  if (!Number.isInteger(DYE_COUNT) || DYE_COUNT < 1 || DYE_COUNT > 64) out.push('DYE_COUNT must be 1..64');
  for (const g of BASE_REGIONS) {
    if (!REGION_LABEL[g]) out.push('base region ' + g + ' has no label');
    const d = BASE_DEFAULT_COLORS[g];
    if (!Number.isInteger(d) || d < 0 || d >= DYE_COUNT) out.push('base region ' + g + ' opens on no dye');
  }
  return out;
}
