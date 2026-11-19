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
  // A brute whose blow and fall outgrow the brute frame (the Landlord, Carter's Rest's cellar elite: a keg swung over his head, a body that
  // falls its whole length): the brute's body in a frame 96 wide and 72 tall, the anchor 66, so the raised keg and the corpse are never cut.
  brute_wide: row({ frame: [96, 72], anchor: [48, 66], body: [41, 52], measure: 'h', contact: 'unit', shadow: 'ellipse', layer: 'unit' }),
  beast: row({ frame: [64, 64], anchor: [32, 56], body: [40, 48], measure: 'w', contact: 'unit', shadow: 'ellipse', layer: 'unit' }),
  // A lean hound as long as a wolf (the Pyre Field's Lurcher): head-on it stands taller than the 48 px vermin frame holds, so it
  // takes the beast's frame and anchor and is measured as vermin are, by its longer side.
  hound: row({ frame: [64, 64], anchor: [32, 56], body: [34, 44], measure: 'max', contact: 'unit', shadow: 'ellipse', layer: 'unit' }),
  box: row({ body: [12, 20], measure: 'h', maxW: 28, contact: 'solid', shadow: 'ellipse', layer: 'prop' }),
  clutter: row({ body: [12, 22], measure: 'h', maxW: 28, contact: 'solid', shadow: 'ellipse', layer: 'prop' }),
  bed: row({ body: [40, 60], measure: 'h', contact: 'legged', shadow: 'ellipse', layer: 'prop' }),
  table: row({ body: [20, 24], measure: 'h', contact: 'legged', shadow: 'ellipse', layer: 'prop' }),
  station: row({ body: [22, 32], measure: 'h', contact: 'legged', shadow: 'ellipse', layer: 'prop' }),
  // A market stall: a trestle under an awning on posts (Hearth Square's east edge), taller than a table.
  stall: row({ body: [48, 72], measure: 'h', contact: 'legged', shadow: 'ellipse', layer: 'prop' }),
  bench: row({ body: [12, 20], measure: 'h', contact: 'legged', shadow: 'ellipse', layer: 'prop' }),
  seat: row({ body: [24, 28], measure: 'h', contact: 'legged', shadow: 'ellipse', layer: 'prop' }),
  bulky: row({ body: [20, 32], measure: 'h', maxW: 40, contact: 'solid', shadow: 'ellipse', layer: 'prop' }),
  // THE HEARTH CHEST, and nothing else (Tyler 2026-11-17, "it's a big deal to open it ... bigger as well"): the Burning Tower's one chest on
  // the Great Hearth, the town's relic. A chest a head over a hero's waist and wider than any bulky prop, so it reads as THE chest from across
  // the square; not a loosening of `bulky` (a crate, a barrel and every other chest stay in theirs). Its loot is the server's.
  relic: row({ body: [40, 48], measure: 'h', maxW: 56, contact: 'solid', shadow: 'ellipse', layer: 'prop' }),
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
  // A gatehouse the road runs through (Krell's Hold's cart gate): drawn like a building, but its anchor tile is the gate's
  // passage, so it never blocks a step (terrain.js OPEN_CLASSES); its towers stand on the map's own rock either side.
  gate: row({ body: [80, 160], measure: 'h', contact: 'touch', shadow: null, layer: 'unit' }),
  // A town's one monument, larger than any building (the Great Hearth of Hearth Square: footprint
  // 11 x 4, art 11 x 11 tiles). Drawn like a building: one closed sprite, its anchor bottom-centre.
  // A big town hall-sized building round a plaza (Hearth Square's general store, depot, bank, guild
  // hall: 10-14 tiles wide). Drawn like a building; the monument (landmark) stays taller.
  hall: row({ body: [200, 320], measure: 'h', contact: 'touch', shadow: null, layer: 'unit' }),
  // The Great Hearth redrawn (2026-11-17: a slate cupola and finial over a tapering stack) stands 390 px: the band's top rose 352 -> 360.
  landmark: row({ body: [240, 360], measure: 'h', contact: 'touch', shadow: null, layer: 'unit' }),
  // A whole town LOT drawn as one sprite: a building with its yard, fence, wall or towers (Havora's gatehouse,
  // tavern, guilds, harbour office and homes P01-P15). Its footprint is the lot; a deep lot's art stands taller
  // than a hall (footprint depth plus the facade), so its own row. Drawn like a building.
  lot: row({ body: [160, 480], measure: 'h', contact: 'touch', shadow: null, layer: 'unit' }),
  // A town palisade (Havora's wall): an east-west run is one 32 px slice of a log strip per column (footprint 1 x 2,
  // the band's two rows), a north-south run one 32 px row of the same stakes stood one behind the other, each rising 96 px
  // over its foot (footprint 2 x 1, raw: one perspective for the whole wall, lane/a-havora-seams-2, tools/world-art/palisade-art.mjs).
  palisade: row({ body: [56, 96], measure: 'h', contact: 'solid', shadow: null, layer: 'unit' }),
  palisade_v: row({ body: [96, 128], measure: 'h', raw: true, contact: 'touch', shadow: null, layer: 'unit' }),
  // A bridge laid over a river (Havora's river crossing): a span wider than the Sewer's grate, walked on.
  bridge: row({ body: [128, 416], measure: 'max', raw: true, contact: 'flat', shadow: null, layer: 'decal' }),
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
  // A long floor hearth (Krell's Hall Fire): a low stone trough of logs and flame four tiles wide, resting along its whole length.
  // It is fire, so it casts no shadow. Its flicker and its flare are clips of the one sprite.
  hallfire: row({ body: [20, 40], measure: 'h', maxW: 128, contact: 'solid', shadow: null, layer: 'prop' }),
  // A trunk lying on the ground (the Meadowbrook's fallen log): long and low, it rests along its length.
  log: row({ body: [14, 24], measure: 'h', maxW: 64, contact: 'solid', shadow: 'ellipse', layer: 'prop' }),
  // A LAYER of a composite prop drawn over its base at the base's anchor (the house training dummy's plates, arms and target):
  // it hangs on the base, so it never meets the floor itself, casts no shadow of its own and may be any size the base is.
  part: row({ body: [4, 72], measure: 'max', raw: true, contact: 'raised', shadow: null, layer: 'prop' }),
  hanging: row({ body: [6, 40], measure: 'h', raw: true, contact: 'raised', shadow: null, layer: 'wall' }),
  // A combat effect (a slash, a heal, a cast): one non-directional clip in its own cropped
  // frame (the sidecar's `frame`), its anchor the point it centres on (the target's chest,
  // a projectile's tip). It never touches the floor and casts no shadow; frames may be
  // blank (an effect fades in and out). `blend` 'add' draws it additively (light), else over.
  vfx: row({ body: [2, 72], measure: 'max', raw: true, contact: 'raised', shadow: null, layer: 'fx', blank: true }),
  // AMBIENT LIFE (src/data/world/ambient-life.js, tools/world-art/town-life.mjs): a column of smoke over a chimney or the
  // Great Hearth's flue, its anchor the mouth it leaves, drawn in the AIR (over the roofs, under the light and the vignette, as
  // the world is); measured by how tall it climbs.
  plume: row({ body: [24, 96], measure: 'h', raw: true, contact: 'raised', shadow: null, layer: 'air', blank: true }),
  // ...and daylight caught on a wave: a few pixels lying flat on the water, under everything standing; between flashes blank.
  glint: row({ body: [1, 12], measure: 'max', raw: true, contact: 'flat', shadow: null, layer: 'decal', blank: true }),
  // ...and the water's ripples: one or two cells square of wave marks laid on the water in step (its anchor the corner), under everything standing.
  ripple: row({ anchor: [0, 0], body: [8, 64], measure: 'max', raw: true, contact: 'raised', shadow: null, layer: 'decal' }),
  // A moving piece of a building, laid over it at its own pixels and drawn in the air after it (the mill's waterwheel turning): its
  // anchor the piece's corner, its frames the building's own pixels moved inside the piece's outline (town-life.mjs wheel).
  turning: row({ anchor: [0, 0], body: [16, 72], measure: 'max', raw: true, contact: 'raised', shadow: null, layer: 'air' }),
  // An animal painted into a building's art come alive (a hen pecking in a yard): its own pixels cut from a still twin of the
  // building and drawn over it, its head moved a pixel or two (town-life.mjs stir); drawn in the air after the building.
  stir: row({ anchor: [0, 0], body: [8, 48], measure: 'max', raw: true, contact: 'raised', shadow: null, layer: 'air' }),
});

// Terrain is T×T, fully opaque. kind 'wang16': corner tiles keyed NW NE SW SE,
// '1' = the upper material, all 16 keys present. kind 'fill': one material, key
// '1111' only, its variants laid as a cycle [cols, rows] (variant index =
// (y mod rows)·cols + (x mod cols)) so a pattern wider than a tile repeats seamlessly.
// kind 'variety': one floor tile's variants (tools/world-art/variety.mjs), key '1111' only,
// picked per cell by src/world/core/ground-variety.js; `of` the terrain whose tile it varies,
// `key` (a wang interior) or `at` [x, y] (a painted ground's cell), `seed`.
export const WANG_KEYS = Object.freeze(Array.from({ length: 16 }, (_, i) => i.toString(2).padStart(4, '0')));

// ── GRID PROFILES (one row per art grid) ─────────────────────────────────────
// ONE TILE SIZE PER SCREEN CLASS: a tile is 64 CSS px on the desktop and the phone and 96 above
// WIDE_CSS (src/world/core/camera.js), whatever its art grid. `base` is the world's grid (T 32 at
// x2 / x3). `hd64` is the 64 px sandbox grid (T 64 at x1; 96 / 64 is not whole, so above WIDE_CSS it
// stays x1 and shows more world). `scale` = T / 32: every art-px rule of a grid is the base rule
// times it (class sizes, shadow offsets, measuring bands). A map names its grid (`grid: 'hd64'`);
// an atlas set names its grid in art/world/<set>/_set.json. Nothing here changes the base grid.
/* the class fields measured in art px (everything else is a name or a rule) */
const PX_FIELDS = Object.freeze(['frame', 'body', 'hover', 'canopy', 'cap', 'maxW', 'face']);
const px2 = (k) => (v) => (Array.isArray(v) ? Object.freeze(v.map((n) => n * k)) : typeof v === 'number' ? v * k : v);
/** CLASSES scaled by k: sizes x k; an anchor's contact row is the scaled row's lowest pixel (k*y + k-1). */
function scaleClasses(classes, k) {
  const out = {};
  for (const [name, c] of Object.entries(classes)) {
    const r = {};
    for (const [f, v] of Object.entries(c)) {
      if (f === 'anchor') r[f] = Object.freeze([v[0] * k, v[1] * k + (k - 1)]);
      else if (PX_FIELDS.includes(f)) r[f] = px2(k)(v);
      else r[f] = v;
    }
    out[name] = Object.freeze(r);
  }
  return Object.freeze(out);
}
const gridRow = (id, T, density, wideDensity) => {
  const scale = T / 32;
  return Object.freeze({ id, T, scale, density, wideDensity,
    classes: scale === 1 ? CLASSES : scaleClasses(CLASSES, scale),
    shadow: scale === 1 ? SHADOW : Object.freeze(Object.assign({}, SHADOW, { dx: SHADOW.dx * scale, dy: SHADOW.dy * scale })) });
};
export const GRIDS = Object.freeze({
  base: gridRow('base', T, 2, 3),
  hd64: gridRow('hd64', 64, 1, 1),
});
/** The grid profile named `id` (missing or unknown: the base grid). */
export const gridOf = (id) => GRIDS[id] || GRIDS.base;

// ── READABILITY (ART_DIRECTION section 4, law for new art) ─────────────────
// A live monster's ring (the body pixels just inside its outline, median luminance) reads at least `ring`:1 against the floor
// it stands on (the painted ground's median under its map's spawn tiles), in its four cardinal idle stills. Held by
// tests/world-assets.mjs rule [ring] on the grounds of these region kits: the shipped grounds before them fail it today (the
// Giant Rat 2.36:1), and are held when their art is redone. Pass with a body's `lift` or a floor's `shade` (build.mjs lockOf).
export const READABLE = Object.freeze({ ring: 3, kits: Object.freeze(['barrow_march', 'morrow_hills']) });

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
//   terrain  { id: { kind, lower, upper, cycle?, of?, key?, at?, seed?, tiles: { NWNESWSE: [[x,y], …] } } }
export const MANIFEST_VERSION = 1;
export const atlasPaths = (set) => Object.freeze({
  image: `assets/world/atlas-${set}.png`,
  manifest: `assets/world/atlas-${set}.json`,
});
