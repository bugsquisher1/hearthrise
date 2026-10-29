// ════════════════════════════════════════════════════════════════════════
// src/data/world/atlas-sets.js — WHICH WORLD ART HAS SHIPPED.
//
// One row per atlas set built by tools/world-art/build.mjs. Each set is
// assets/world/atlas-<set>.png + .json (paths: atlasPaths() in
// src/data/world/art-budget.js, which also documents the manifest shape). The
// renderer reads every set's manifest listed here on the World pane's first open,
// and a set's image when a scene that draws from it shows (src/world/scene-sets.js);
// a sprite id that no loaded set carries is drawn as a stub box (src/world/stub-atlas.js),
// so a map can name art before it exists and a failed load never blanks a scene.
// A new set is one row here; nothing else changes.
// ════════════════════════════════════════════════════════════════════════

export const ATLAS_SETS = Object.freeze(['hunt', 'vfx', 'sewer', 'mill', 'common', 'cottage', 'forest', 'warren', 'glade', 'havora', 'stead', 'march', 'muster']);

/* THE SETS OF ANOTHER ART GRID (src/data/world/art-budget.js GRIDS), by grid. They are not loaded
   on the pane's first open: the first scene drawn on that grid loads them into a book of their own
   (src/world/sandbox-scene.js), so no player outside it downloads them and no id is shared with
   the base grid's book. */
export const GRID_SETS = Object.freeze({ hd64: Object.freeze(['sandbox64']) });

/** Every set the renderer can load, on any grid (the art guards read this list). */
export const LOADED_SETS = Object.freeze(ATLAS_SETS.concat(...Object.values(GRID_SETS)));
