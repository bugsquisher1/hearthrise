// ════════════════════════════════════════════════════════════════════════
// src/data/world/atlas-sets.js — WHICH WORLD ART HAS SHIPPED.
//
// One row per atlas set built by tools/world-art/build.mjs. Each set is
// assets/world/atlas-<set>.png + .json (paths: atlasPaths() in
// src/data/world/art-budget.js, which also documents the manifest shape). The
// renderer loads every set listed here on the World pane's first open; a sprite
// id that no loaded set carries is drawn as a stub box (src/world/stub-atlas.js),
// so a map can name art before it exists and a failed load never blanks a scene.
// A new set is one row here; nothing else changes.
// ════════════════════════════════════════════════════════════════════════

export const ATLAS_SETS = Object.freeze(['hero', 'cellar', 'town', 'home']);
