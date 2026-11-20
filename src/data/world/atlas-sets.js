// ════════════════════════════════════════════════════════════════════════
// src/data/world/atlas-sets.js — WHICH WORLD ART HAS SHIPPED.
//
// One row per atlas set built by tools/world-art/build.mjs. Each set is
// assets/world/atlas-<set>.png + .json (paths: atlasPaths() in
// src/data/world/art-budget.js, which also documents the manifest shape). The
// renderer reads the manifest of every set listed here but the worn sets (FIRST_OPEN_SETS)
// on the World pane's first open, and a set's image when a scene that draws from it shows
// (src/world/scene-sets.js); a worn set's manifest and image come only when a hero in view
// wears one of its looks (WORN_SETS below). A sprite id that no loaded set carries is drawn
// as a stub box (src/world/stub-atlas.js), so a map can name art before it exists and a
// failed load never blanks a scene. A new set is one row here; nothing else changes.
// ════════════════════════════════════════════════════════════════════════

export const ATLAS_SETS = Object.freeze(['hunt', 'vfx', 'sewer', 'mill', 'common', 'cottage', 'forest', 'warren', 'glade', 'havora', 'stead', 'heroes', 'yard', 'march', 'ford', 'muster', 'slake', 'pyre', 'pyrefolk', 'hold', 'holdguard', 'holdkeep', 'tower', 'vaultdead', 'vaultliving', 'vault', 'forest-floor', 'glade-floor', 'slake-floor', 'muster-floor', 'stead-floor', 'havora-floor', 'oxroad-floor', 'townlife', 'townsfolk', 'hearth', 'factionwear', 'morrowfolk', 'oxroadfolk', 'morrow']);
/* `factionwear` (lane/b-farm-house-faction-art 2026-11-18): the faction outfits worn (outfit_flamebearer, outfit_emberkeeper), a hero set of
   their own because `heroes` is full (nine outfits fill 2048x1756 of ATLAS_MAX 2048x2048). A worn set (WORN_SETS): fetched only when a
   hero in view wears one of its looks. */

/* `morrow` (lane/b-morrow-kit 2026-11-19): the Morrow Hills' kit (the inn's props) and Carter's Rest's painted ground, staged with it. */
/* `morrowfolk` (lane/b-morrow-art 2026-11-19): the Morrow Hills' creatures (Carter's Rest's five trolls), for grounds still staged: nothing
   places them until a map row names them. */

/* `oxroadfolk` (lane/b-morrow-art 2026-11-19, batch 2): the Ox Road's five (the Dead Teamster, the Coal Runner, the Drover, the
   Wagonmaster, the Yoke Ox), their own set because morrowfolk's five trolls fill 2048x1348 of ATLAS_MAX and these five would take it past
   2048. Staged like morrowfolk: nothing places them until the Ox Road's map names them. */

/* THE WORN SETS: a hero set whose looks only some heroes wear (the faction looks, earned with standing), with the sprite ids it carries.
   Nothing of one is fetched on a first open, by the sign-in roster or by the Character window: its manifest, its sheet and its mask set
   come the first time a hero drawn from it is on screen (the World: src/world/worn-sets.js; a portrait or a card:
   src/render/outfit-sprite.js; its colors: src/world/hero-dye.js), so an account that never meets one fetches none of it (v0.2.142:
   tests/client-boot.mjs B-22). Each list is the set's own sprites, held to its built manifest by tests/world-assets.mjs (hero-set). */
export const WORN_SETS = Object.freeze({ factionwear: Object.freeze(['outfit_flamebearer', 'outfit_emberkeeper']) });

/** The base-grid sets whose manifests the World reads on its first open: every set but the worn ones. */
export const FIRST_OPEN_SETS = Object.freeze(ATLAS_SETS.filter((s) => !Object.hasOwn(WORN_SETS, s)));

const WORN_OF = Object.freeze(Object.fromEntries(Object.entries(WORN_SETS).flatMap(([set, ids]) => ids.map((id) => [id, set]))));
/** The worn set sprite `id` is drawn from, or null: a sprite of a set every first open reads. */
export const wornSetOf = (id) => (Object.hasOwn(WORN_OF, id) ? WORN_OF[id] : null);

/* THE SETS OF ANOTHER ART GRID (src/data/world/art-budget.js GRIDS), by grid. They are not loaded
   on the pane's first open: the first scene drawn on that grid loads them into a book of their own
   (src/world/sandbox-scene.js), so no player outside it downloads them and no id is shared with
   the base grid's book. */
export const GRID_SETS = Object.freeze({ hd64: Object.freeze(['sandbox64']) });

/** Every set the renderer can load, on any grid (the art guards read this list). */
export const LOADED_SETS = Object.freeze(ATLAS_SETS.concat(...Object.values(GRID_SETS)));

/* THE REGION-MASK SETS (dyes): mask set -> the set whose sprites it masks. Never drawn and never loaded on the
   pane's first open: the dye code loads one on first need (src/world/atlas.js loadAtlasSet). Its sprite
   `<id>_mask` is sprite <id>'s frames keyed by region (src/data/outfits.js MASK_COLOURS), built unpalette-locked by
   tools/world-art/build.mjs, written by tools/world-art/outfit-masks.mjs and held to <id> by tests/outfit-masks.mjs. */
export const MASK_SETS = Object.freeze({ 'hunt-masks': 'heroes', 'factionwear-masks': 'factionwear' });

/* THE HERO SETS: every set a worn outfit's sheet (src/data/hunt-outfits.js OUTFITS) may be in, in the order the Character window, the
   roster and creation load them (src/render/outfit-sprite.js outfitArt). `heroes` is full at ATLAS_MAX (law, never raised), so the
   faction looks are in `factionwear` (lane/c-faction-outfit-path 2026-11-18), a worn set: loaded only for a sprite drawn from it
   (heroSetsFor). Each has its mask set above (the dyes); the World finds a hero's set from its sprite id (src/world/scene-sets.js).
   tests/world-assets.mjs holds every OUTFITS sprite to one of these. */
export const HERO_SETS = Object.freeze(['heroes', 'factionwear']);

const MASK_OF = Object.freeze(Object.fromEntries(Object.entries(MASK_SETS).map(([mask, base]) => [base, mask])));
/** The hero sets drawing `sprites` takes, in HERO_SETS order: every hero set that is not worn, and the worn sets of those sprites. */
export function heroSetsFor(sprites) {
  const worn = new Set((sprites || []).map(wornSetOf).filter(Boolean));
  return HERO_SETS.filter((s) => !Object.hasOwn(WORN_SETS, s) || worn.has(s));
}
/** Their mask sets (the dyes): one per hero set heroSetsFor names. */
export const maskSetsFor = (sprites) => heroSetsFor(sprites).map((s) => MASK_OF[s]).filter(Boolean);
