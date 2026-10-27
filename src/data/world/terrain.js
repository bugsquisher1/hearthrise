// ════════════════════════════════════════════════════════════════════════
// src/data/world/terrain.js — WHAT A MAP TILE IS MADE OF, AND WHAT GLOWS.
//
// The art (frames, footprints, classes, shadows) lives in the atlas manifests;
// this file only says what the art does not:
//   MATERIALS   what a legend character means. `solid` blocks walking; `wall`
//               names the wall kit a solid material is faced with; `trees` marks a painted
//               wood (the outdoor tree lint counts its tiles as trees); `green` marks open
//               country: L-TREES asks for a tree in every window that is mostly green (a
//               window of sea, cliff, paving or building footprints is not a meadow)
//               (<wall>_wall, <wall>_cap, <wall>_cap_h, <wall>_cap_w). A `flat`
//               solid (water) carries no kit and is never drawn as a raised wall.
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
  grass: Object.freeze({ solid: false, green: true }),
  cobble: Object.freeze({ solid: false }),
  planks: Object.freeze({ solid: false }),
  rock: Object.freeze({ solid: true, wall: 'stone' }),
  /* Sewage (the Millrace Sewer's channel): it blocks a step but is FLAT, so no wall kit is
     drawn over it and it hides nothing behind it; the water is in the Sewer's painted ground. */
  sewage: Object.freeze({ solid: true, flat: true }),
  /* The Meadowbrook Thicket (2026-10-18): the thicket blocks a step and a shot and IS trees (the
     L-TREES lint counts it: a painted wood needs no tree sprite in every window); the brook, with
     its grassy banks, is flat water like the sewage. The Coppercap Warrens' chasm is flat too. */
  thicket: Object.freeze({ solid: true, trees: true }),
  brook: Object.freeze({ solid: true, flat: true }),
  chasm: Object.freeze({ solid: true, flat: true }),
  /* Havora, the real town (2026-10-25, blueprint v0.5 x2): its river and sea and the mountain's cliffs block a step
     and are FLAT (no wall kit, they hide nothing); the shack palisade is its sprites (below); a `site` is the floor of
     a building footprint whose art is not drawn yet, `tilled` a farm plot. A cell no wang16 pair draws stays in its
     material's placeholder tone (--world-ground-<id>-a/-b, src/world/core/compose.js). */
  water: Object.freeze({ solid: true, flat: true }),
  cliff: Object.freeze({ solid: true, flat: true }),
  /* the palisade's cells are walled by its style-1 sprites (town/palisade.js), which block every one of them: the
     ground itself is open, drawn as grass under the logs (BLEND alias, town/sites.js) */
  palisade: Object.freeze({ solid: false }),
  site: Object.freeze({ solid: false }),
  tilled: Object.freeze({ solid: false, green: true }),
  /* the quarry's floor of packed gravel (lane/b-havora-polish 2026-10-26): walked on, drawn by its own pairs with the
     mountain rock and the dirt road (havora_gravel_rock, havora_earth_gravel) */
  gravel: Object.freeze({ solid: false }),
  /* the harbour's granite setts (lane/a-havora-dock 2026-10-26): the quay, the estates' yard, building footings */
  setts: Object.freeze({ solid: false }),
});

/* 'span' and 'bridge' (laid over water or a gap) are walked ON: it never blocks the step it covers (2026-10-18:
   the Sewer's grate bridge sealed its own 1-tile choke in the client mask until this). */
export const OPEN_CLASSES = Object.freeze(['decal', 'small', 'loot', 'hanging', 'roof', 'wallcap', 'span', 'bridge']);
export const TREE_CLASSES = Object.freeze(['tree', 'sapling']);

const light = (radius, tint) => Object.freeze({ radius, tint });
export const LIGHTS = Object.freeze({
  wall_torch: light(5, 'torch'),
  brazier: light(4, 'brazier'),
  lamppost: light(3, 'torch'),
  candle: light(1.5, 'torch'),
  hearth: light(4.5, 'hearth'),
  /* the Great Hearth of Hearth Square: the warmest light in town */
  great_hearth: light(8, 'hearth'),
  forge: light(3, 'hearth'),
});
