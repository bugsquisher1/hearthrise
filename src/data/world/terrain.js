// ════════════════════════════════════════════════════════════════════════
// src/data/world/terrain.js — WHAT A MAP TILE IS MADE OF, AND WHAT GLOWS.
//
// The art (frames, footprints, classes, shadows) lives in the atlas manifests;
// this file only says what the art does not:
//   MATERIALS   what a legend character means. `solid` blocks walking; `wall`
//               names the wall kit a solid material is faced with
//               (<wall>_wall, <wall>_cap, <wall>_cap_h, <wall>_cap_w).
//   OPEN_CLASSES  art classes that never block a step (lying flat, small, hung
//               on a wall, drawn above everything). Every other placed sprite
//               is solid on its footprint.
//   TREE_CLASSES  what the outdoor-map tree lint counts.
//   LIGHTS      sprite id → the point light it casts (radius in tiles, and the
//               --world-light-<tint> token it is coloured with).
// PURE ESM, no DOM. Display data only: nothing here is a server number.
// ════════════════════════════════════════════════════════════════════════

export const MATERIALS = Object.freeze({
  earth: Object.freeze({ solid: false }),
  flagstone: Object.freeze({ solid: false }),
  grass: Object.freeze({ solid: false }),
  cobble: Object.freeze({ solid: false }),
  planks: Object.freeze({ solid: false }),
  rock: Object.freeze({ solid: true, wall: 'stone' }),
});

export const OPEN_CLASSES = Object.freeze(['decal', 'small', 'loot', 'hanging', 'roof', 'wallcap']);
export const TREE_CLASSES = Object.freeze(['tree', 'sapling']);

const light = (radius, tint) => Object.freeze({ radius, tint });
export const LIGHTS = Object.freeze({
  wall_torch: light(5, 'torch'),
  brazier: light(4, 'brazier'),
  lantern_post: light(3, 'torch'),
  candle: light(1.5, 'torch'),
  hearth: light(4.5, 'hearth'),
  forge: light(3, 'hearth'),
});
