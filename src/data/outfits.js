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
//   bundle    the bag item whose use makes the outfit the hero's own (the Key Warden, the Hearth Chest's super-rare: the Burning
//             Tower board §5; src/data/chests.js CHEST_OUTFITS rolls it). Owned only through it, never by premium or by everyone:
//             hr_outfits carries the bundle (tools/gen-outfits.mjs), hr_outfit_owned owns such a row only for a hero with its
//             player_cosmetics 'outfit' row, written once by hr_outfit_bundle_use (2027-04-30-sweeps-coat.sql), and the Character
//             window lists it only once the server says the hero owns it.
//   pieces    the faction pieces (src/data/factions.js FACTION_OUTFITS) a hero must hold, EVERY one, to own this look: claimed with
//             standing (hr_faction_claims), never taken back, kept across a swap. hr_outfit_owned reads the claims for such a row
//             (2027-05-19-faction-outfit-path.sql); never premium, never a bundle; listed, like a bundle row, only once owned.
// DYES are the colours a region may take: DYE_COUNT tokens --dye-N in
// src/styles/tokens.css, each a colour of the world palette. A saved colour is an
// INDEX; the server checks it against hr_outfit_dyes.
// The server's rows are generated from these (tools/gen-outfits.mjs --check, held by
// tests/character-window.mjs CW-D1): regenerate after any edit.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { OUTFITS } from './hunt-outfits.js';

const row = (label, premium, parts, plain, bundle, pieces) => Object.freeze({
  label, premium, regions: Object.freeze(Object.keys(parts)), parts: Object.freeze(parts), plain: plain || null, bundle: bundle || null,
  pieces: pieces ? Object.freeze([...pieces]) : null,
});

export const OUTFIT_ROWS = Object.freeze({
  knight: row('Plate Harness', false, { head: 'Plume', body: 'Waist cloth' }),
  berserker: row('Fur Wraps', false, { head: 'Helmet', body: 'Tunic', feet: 'Boots' }),
  ranger: row('Hooded Leathers', false, { head: 'Hair', legs: 'Skirt panel' }),
  sorcerer: row('Scholar’s Robe', false, { head: 'Hat', body: 'Robe', feet: 'Boots' }),
  druid: row('Grove Robe', false, {}, 'Fixed green, colors kept for other outfits'),
  brute: row('Quarry Brute', true, { head: 'Cap', body: 'Shirt' }),
  witch: row('Hedge Witch', true, { head: 'Hat', body: 'Robe', feet: 'Trim' }),
  dawnward: row('Dawnward', true, { body: 'Cape' }),
  /* round 6 (Tyler's hooded keeper): the hood and its cape, the robe, the apron with the boots; the key, the singed edges and the rope stay as drawn, so no legs */
  sweeps_coat: row('Key Warden', false, { head: 'Hood', body: 'Robe', feet: 'Apron and boots' }, null, 'sweeps_coat_bundle'),
  /* the faction outfits (the designer 2026-11-18, ./outfits.js STAGED_OUTFITS below for their add-ons): owned while the hero holds the outfit's own
     piece (hr_faction_claims), listed once owned or, locked, while the factions are on. The dye keys the cloth only: the Flamebearer's antique gold
     tabard and trim, the Emberkeeper's crimson cloth (the steel, the charcoal plate, the neck cloth, the flame and the lit eyes stay as drawn) */
  flamebearer: row('Flamebearer', false, { body: 'Tabard' }, null, null, ['flamebearer']),
  emberkeeper: row('Emberkeeper', false, { body: 'Cloth' }, null, null, ['emberkeeper']),
});

/* THE FACTION LOOKS, STAGED (Tyler 2026-11-14: "more paladin like outfits vs grim reaper type outfit unlocks. (Both can be unlocked by
   swapping factions)"; the board's "2026-11-14 The Morrow Hills" §6). Look id -> the pieces it needs. AN ADD-ON IS PART OF ITS OUTFIT
   (the designer 2026-11-18): the outfit alone and the outfit with ONE of its add-ons are each a look on its own sheet, owned while the
   hero holds every piece it names. A hero holding both add-ons shows one, by choice: the Outfit tab's one card for the outfit picks the
   look (Add-on: None, Shield, Light), worn through hr_outfit_set. The first piece is the outfit's own. The glows (the ring, the coals)
   are lit palette pixels on the sheets, not effects. The two base looks are listed above (their sheets in `factionwear`, 2026-11-18).
   The add-on looks here are served by the server now (tools/gen-outfits.mjs, hr_outfits.pieces) and listed by no page until their
   sheets land after art review (validate: every OUTFIT_ROWS row has a sprite; CLAUDE.md §3.5): as one lands, its id goes into
   hunt-outfits.js OUTFITS and its row moves from here into OUTFIT_ROWS with its label, regions and parts, and the same pieces. */
export const STAGED_OUTFITS = Object.freeze({
  flamebearer_shield: Object.freeze(['flamebearer', 'flamebearer_shield']),
  flamebearer_light: Object.freeze(['flamebearer', 'flamebearer_light']),
  emberkeeper_lantern: Object.freeze(['emberkeeper', 'emberkeeper_lantern']),
  emberkeeper_coal: Object.freeze(['emberkeeper', 'emberkeeper_coal']),
});

/** Is this row a find or an earning (a bundle, or faction pieces): listed only once the server says the hero owns it? Pure. */
export const earnedOnly = (r) => !!r && (!!r.bundle || !!r.pieces);

/** The outfit a look is worn on: for an add-on's look, the listed look owned by its first piece alone; else the look itself. Pure. */
export function outfitOfLook(id, rows = OUTFIT_ROWS) {
  const r = rows[id];
  if (!r || !r.pieces || r.pieces.length < 2) return id;
  const base = Object.keys(rows).find((k) => rows[k].pieces && rows[k].pieces.length === 1 && rows[k].pieces[0] === r.pieces[0]);
  return base || id;
}

/** The add-on looks of the outfit `base`, in row order: [{ look, piece }] (the add-on's piece is the look's second). Pure. */
export function addonLooks(base, rows = OUTFIT_ROWS) {
  const b = rows[base];
  if (!b || !b.pieces || b.pieces.length !== 1) return [];
  return Object.keys(rows).filter((k) => rows[k].pieces && rows[k].pieces.length === 2 && rows[k].pieces[0] === b.pieces[0])
    .map((k) => ({ look: k, piece: rows[k].pieces[1] }));
}

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

/* sprite id -> outfit id, for a reader that holds only the sprite (the World's units, a portrait) */
const OUTFIT_OF_SPRITE = Object.freeze(Object.fromEntries(Object.entries(OUTFITS).map(([id, s]) => [s, id])));

/**
 * A FACTION LOOK WEARS ITS SIDE'S COLORS AS DRAWN (blind faction QA 2026-11-19 #5: a default Flamebearer took the creation default's crimson body dye
 * and stood red beside a red Emberkeeper; the First Flame's color is the antique gold its tabard and its icon are drawn in). A look owned through
 * faction pieces keeps its art's own colors while every region it shows still holds the creation default (BASE_DEFAULT_COLORS); a dye the player
 * chose there wins and recolors it as any outfit. `look`: an outfit id or its sprite id; `colors`: { head, body, legs, feet } dye indices.
 * Returns the colors to draw with, or null: draw it as drawn. Pure.
 */
export function lookColors(look, colors) {
  if (!colors) return null;
  const r = OUTFIT_ROWS[look] || OUTFIT_ROWS[OUTFIT_OF_SPRITE[look]];
  if (!r || !r.pieces || !r.regions.length) return colors;
  return r.regions.every((g) => colors[g] === BASE_DEFAULT_COLORS[g]) ? null : colors;
}

/** The World's form of lookColors: sprite `sprite` drawn with dye key `key` ("head.body.legs.feet"), or null when it draws as drawn. Pure. */
export function lookDyeKey(sprite, key) {
  if (!key) return null;
  const [head, body, legs, feet] = String(key).split('.').map(Number);
  return lookColors(sprite, { head, body, legs, feet }) ? key : null;
}

/** The outfit ids in display order. */
export const OUTFIT_IDS = Object.freeze(Object.keys(OUTFIT_ROWS));

/* A look's pieces: one to four piece ids, none twice (hr_outfits_pieces_shape holds the server's copy to the same). */
function piecesProblems(id, pieces) {
  if (!Array.isArray(pieces) || pieces.length < 1 || pieces.length > 4) return [id + ': its pieces are not one to four piece ids'];
  const out = [];
  for (const p of pieces) if (typeof p !== 'string' || !/^[a-z0-9_]{1,32}$/.test(p)) out.push(id + ': ' + p + ' is not a piece id');
  if (new Set(pieces).size !== pieces.length) out.push(id + ': it names a piece twice');
  return out;
}

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
    if (r.bundle !== null && (typeof r.bundle !== 'string' || !/^[a-z0-9_]{1,40}$/.test(r.bundle))) out.push(id + ': its bundle is not an item id');
    if (r.bundle && r.premium) out.push(id + ': owned through its bundle, so premium cannot own it too');
    if (r.pieces !== null) out.push(...piecesProblems(id, r.pieces));
    if (r.pieces && (r.premium || r.bundle)) out.push(id + ': owned through faction pieces, so neither premium nor a bundle can own it too');
  }
  const single = new Set(Object.values(STAGED_OUTFITS).concat(OUTFIT_IDS.map((id) => OUTFIT_ROWS[id].pieces))
    .filter((p) => p && p.length === 1).map((p) => p[0]));
  for (const [id, pieces] of Object.entries(STAGED_OUTFITS)) {
    if (!/^[a-z0-9_]{1,32}$/.test(id)) out.push(id + ': not an outfit id');
    if (OUTFIT_ROWS[id]) out.push(id + ': staged and listed both');
    if (OUTFITS[id]) out.push(id + ': its sheet has landed, so its row moves into OUTFIT_ROWS with its label, regions and parts');
    out.push(...piecesProblems(id, pieces));
  }
  /* an add-on is worn on its outfit: a look of several pieces starts with the piece a one-piece look is owned by; and it shows ONE
     add-on (the designer 2026-11-18: both add-ons held, one shown, by choice) */
  for (const [id, pieces] of Object.entries(STAGED_OUTFITS).concat(OUTFIT_IDS.map((id) => [id, OUTFIT_ROWS[id].pieces]))) {
    if (Array.isArray(pieces) && pieces.length > 1 && !single.has(pieces[0])) out.push(id + ': its first piece ' + pieces[0] + ' owns no outfit of its own');
    if (Array.isArray(pieces) && pieces.length > 2) out.push(id + ': it shows ' + (pieces.length - 1) + ' add-ons, and a look shows one');
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
