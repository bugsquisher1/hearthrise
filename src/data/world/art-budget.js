// src/data/world/art-budget.js — the scale budget of the pixel world, and the
// atlas manifest every world renderer reads.
//
// One grid: T = 32 art px per tile, drawn at an integer zoom (×2, ×3 only above 2400 CSS px).
// Every sprite belongs to a CLASS; the class fixes its body size (±TOLERANCE), its
// frame, how it touches the ground (contact), its shadow and its draw layer.
// tests/world-assets.mjs enforces this table on every committed atlas, so relative
// scale (a hero ~1.2 tiles, a door 1.5, a tree 3-4, a chest below the hip) is a
// rule, not a habit. Add a row here before adding a new kind of sprite.
//
// body    [min, max] art px of the measured MASS: the opaque shape with every
//         feature thinner than 3 px removed (a sword blade, a tail, an antenna).
// raw     measure the whole opaque box, not the mass (line art: webs, cracks, decals)
// measure 'h' height · 'w' width · 'max' the larger of the two · 'min' the smaller
//         (a flier: spread wings are its sword, the body is the narrower extent).
// contact how the sprite meets the floor at its anchor (the contact row):
//         unit   frames share the class anchor; feet stand on it
//         solid  ≥ 40% of the width rests within 2 px of the anchor; no iso corner
//         legged ≥ 2 contact spans covering ≥ 60% of the width (tables, chairs,
//                stations: waist-high counters, desks, workbenches, grindstones)
//         post   one trunk or post centred on its footprint (trees, lamps)
//         touch  something reaches the anchor (small clutter)
//         flier  the lowest pixel hovers hover_px above the anchor
//         wall   ≥ 90% of the width on the anchor row
//         flat   lies on the floor (rugs, decals, terrain)
//         raised drawn at height, never touches the floor (wall caps, roofs)
// shadow  'ellipse' (runtime, one alpha) · 'cast' (down-right, by height) · null.
//         Shadows are NEVER drawn into the art: no pixel may sit below the anchor
//         except a declared overhang.

export const T = 32;
export const TOLERANCE = 0.10;
export const ATLAS_MAX = 2048;
export const DIRS = Object.freeze(['s', 'e', 'n', 'w']);
// Every facing a clip may carry: the four cardinals every unit has (DIRS), then the
// four diagonals an 8-way walk adds. A source sheet lays its rows in THIS order,
// skipping the facings a sidecar does not declare, so a four-facing sheet is unchanged.
export const FACINGS = Object.freeze(['s', 'e', 'n', 'w', 'se', 'sw', 'ne', 'nw']);

// Runtime ellipse: w = min(0.8 × footprint width × T, 1.1 × mass width), h = 0.35 w,
// offset (+2, +2), all composited once at --world-shadow-alpha. Fliers' shadows sit
// on the ground at the anchor, not under the sprite.
export const SHADOW = Object.freeze({ footprintK: 0.8, massK: 1.1, aspect: 0.35, dx: 2, dy: 2 });

const row = (o) => Object.freeze(o);
export const CLASSES = Object.freeze({
  character: row({ frame: [64, 64], anchor: [32, 58], body: [36, 40], measure: 'h', contact: 'unit', shadow: 'ellipse', layer: 'unit' }),
  critter: row({ frame: [48, 48], anchor: [24, 40], body: [12, 20], measure: 'max', contact: 'unit', shadow: 'ellipse', layer: 'unit' }),
  flier: row({ frame: [48, 48], anchor: [24, 44], body: [12, 20], measure: 'min', contact: 'flier', hover: [6, 16], shadow: 'ellipse', layer: 'unit' }),
  // The Sewer's full-size 48 px monsters (a drain rat, a sump slime, a cistern spider; the bat is a flier of the same frame): bigger than a cellar critter, smaller than a hero.
  vermin: row({ frame: [48, 48], anchor: [24, 40], body: [28, 40], measure: 'max', contact: 'unit', shadow: 'ellipse', layer: 'unit' }),
  vermin_flier: row({ frame: [48, 48], anchor: [24, 44], body: [20, 32], measure: 'min', contact: 'flier', hover: [6, 16], shadow: 'ellipse', layer: 'unit' }),
  // A humanoid boss a head taller than a hero (Chief Coppercap): the character frame and anchor, a bigger body.
  brute: row({ frame: [64, 64], anchor: [32, 58], body: [41, 52], measure: 'h', contact: 'unit', shadow: 'ellipse', layer: 'unit' }),
  beast: row({ frame: [64, 64], anchor: [32, 56], body: [40, 48], measure: 'w', contact: 'unit', shadow: 'ellipse', layer: 'unit' }),
  box: row({ body: [12, 20], measure: 'h', maxW: 28, contact: 'solid', shadow: 'ellipse', layer: 'prop' }),
  clutter: row({ body: [12, 22], measure: 'h', maxW: 28, contact: 'solid', shadow: 'ellipse', layer: 'prop' }),
  bed: row({ body: [40, 60], measure: 'h', contact: 'legged', shadow: 'ellipse', layer: 'prop' }),
  table: row({ body: [20, 24], measure: 'h', contact: 'legged', shadow: 'ellipse', layer: 'prop' }),
  station: row({ body: [22, 32], measure: 'h', contact: 'legged', shadow: 'ellipse', layer: 'prop' }),
  bench: row({ body: [12, 20], measure: 'h', contact: 'legged', shadow: 'ellipse', layer: 'prop' }),
  seat: row({ body: [24, 28], measure: 'h', contact: 'legged', shadow: 'ellipse', layer: 'prop' }),
  bulky: row({ body: [20, 32], measure: 'h', maxW: 40, contact: 'solid', shadow: 'ellipse', layer: 'prop' }),
  barrel: row({ body: [24, 28], measure: 'h', contact: 'solid', shadow: 'ellipse', layer: 'prop' }),
  small: row({ body: [4, 12], measure: 'max', contact: 'touch', shadow: null, layer: 'prop' }),
  loot: row({ body: [8, 14], measure: 'max', contact: 'touch', shadow: 'ellipse', layer: 'prop' }),
  bush: row({ body: [12, 28], measure: 'h', contact: 'solid', shadow: 'ellipse', layer: 'prop' }),
  fixture: row({ body: [16, 72], measure: 'h', contact: 'post', shadow: 'cast', layer: 'prop' }),
  tree: row({ body: [96, 128], measure: 'h', canopy: [64, 96], contact: 'post', shadow: 'cast', layer: 'unit' }),
  sapling: row({ body: [60, 100], measure: 'h', contact: 'post', shadow: 'cast', layer: 'unit' }),
  // A whole building drawn as one style-1 sprite, roof and front wall (a closed facade: the
  // smithy, the mill, a neighbour's cottage). Its footprint is the ground it covers.
  building: row({ body: [80, 160], measure: 'h', contact: 'touch', shadow: null, layer: 'unit' }),
  door: row({ body: [48, 48], measure: 'h', contact: 'solid', shadow: null, layer: 'wall' }),
  wall: row({ frame: [32, 60], anchor: [16, 59], body: [56, 60], measure: 'h', face: 48, cap: [8, 12], contact: 'wall', shadow: 'cast', layer: 'wall' }),
  wallend: row({ frame: [12, 60], anchor: [6, 59], body: [56, 60], measure: 'h', contact: 'wall', shadow: 'cast', layer: 'wall' }),
  stub: row({ frame: [32, 24], anchor: [16, 23], body: [20, 24], measure: 'h', contact: 'wall', shadow: null, layer: 'wall' }),
  wallcap: row({ body: [8, 32], measure: 'max', contact: 'raised', shadow: null, layer: 'wall' }),
  roof: row({ body: [16, 256], measure: 'h', contact: 'raised', shadow: null, layer: 'roof' }),
  decal: row({ body: [2, 64], measure: 'max', raw: true, contact: 'flat', shadow: null, layer: 'decal' }),
  // A span laid flat over water or a gap (the Sewer's iron grate bridge): a decal several tiles long.
  span: row({ body: [64, 160], measure: 'max', raw: true, contact: 'flat', shadow: null, layer: 'decal' }),
  // Wreckage wider than a crate (the Sewer's collapsed cart): something of it reaches the floor.
  wreck: row({ body: [28, 44], measure: 'h', maxW: 64, contact: 'touch', shadow: 'ellipse', layer: 'prop' }),
  // A trunk lying on the ground (the Meadowbrook's fallen log): long and low, it rests along its length.
  log: row({ body: [14, 24], measure: 'h', maxW: 64, contact: 'solid', shadow: 'ellipse', layer: 'prop' }),
  hanging: row({ body: [6, 40], measure: 'h', raw: true, contact: 'raised', shadow: null, layer: 'wall' }),
  // A combat effect (a slash, a heal, a cast): one non-directional clip in its own cropped
  // frame (the sidecar's `frame`), its anchor the point it centres on (the target's chest,
  // a projectile's tip). It never touches the floor and casts no shadow; frames may be
  // blank (an effect fades in and out). `blend` 'add' draws it additively (light), else over.
  vfx: row({ body: [2, 72], measure: 'max', raw: true, contact: 'raised', shadow: null, layer: 'fx', blank: true }),
});

// Terrain is T×T, fully opaque. kind 'wang16': corner tiles keyed NW NE SW SE,
// '1' = the upper material, all 16 keys present. kind 'fill': one material, key
// '1111' only, its variants laid as a cycle [cols, rows] (variant index =
// (y mod rows)·cols + (x mod cols)) so a pattern wider than a tile repeats seamlessly.
export const WANG_KEYS = Object.freeze(Array.from({ length: 16 }, (_, i) => i.toString(2).padStart(4, '0')));

// ── THE ATLAS MANIFEST (assets/world/atlas-<set>.json) ──────────────────────
// The contract between tools/world-art/build.mjs and the world renderer.
//   version  MANIFEST_VERSION
//   set      the set name; image is atlasPaths(set).image, loaded with ?v=BUILD.cache
//   palette  PALETTE_ID the atlas was locked to
//   T, size [w, h], pixels (sha256 of the decoded RGBA, the drift identity)
//   sprites  { id: { class, layer, frame:[w,h], anchor:[x,y], footprint:[w,h],
//                    overhang:[t,r,b,l], hover, height, contact:[x0,x1],
//                    shadow: null | {kind:'ellipse', w, h, dx, dy}
//                                 | {kind:'cast', height, base:[x0,x1]},
//                    blend?: 'add' (vfx class: drawn additively),
//                    anims: { name: { fps, loop, hit?, dirs: { s|e|n|w|se|sw|ne|nw: [[x,y], …] } } } } }
//            Frame rects are [x, y] + the sprite's frame size. A non-directional
//            sprite has only 's'; a renderer falls back to 's' for a missing dir.
//            The anchor is the contact point: draw the frame at
//            (tileX·T + T·fw/2 − anchor.x, tileY·T + T·fh − 1 − anchor.y) and the
//            contact row lands on the footprint's south pixel row. Placement is
//            whole tiles; there is no per-sprite offset.
//            Wall slices (classes wall, stub) carry their frames as a horizontal
//            CYCLE: the slice at tile column x uses frame (x mod frames), so a
//            128 px stone pattern repeats without a seam every 32 px.
//   terrain  { id: { kind, lower, upper, cycle?, tiles: { NWNESWSE: [[x,y], …] } } }
export const MANIFEST_VERSION = 1;
export const atlasPaths = (set) => Object.freeze({
  image: `assets/world/atlas-${set}.png`,
  manifest: `assets/world/atlas-${set}.json`,
});
