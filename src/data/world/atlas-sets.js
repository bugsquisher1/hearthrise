// ════════════════════════════════════════════════════════════════════════
// src/data/world/atlas-sets.js — WHICH WORLD ART HAS SHIPPED.
//
// The world renderer (src/world/atlas.js) draws every sprite from a frame in
// one of these sets. A sprite id no set carries is drawn from the runtime stub
// atlas instead (a box sized by its art-budget class), so a map can name art
// before the art exists and nothing breaks when it arrives.
//
// THIS FILE IS WRITTEN BY tools/world-art/pack.mjs (lane W2). Adding a set is a
// data row, never a code change. Row shape:
//
//   <set>: {
//     image: 'assets/world/atlas-<set>.png',   // loaded with ?v=<BUILD.cache>
//     w, h,                                    // atlas size, <= 2048 each
//     frames: {
//       <sprite id>: {
//         x, y, w, h,              // the frame rect in the atlas
//         anchor_px: [ax, ay],     // the contact row's centre, frame-relative
//         class,                   // art-budget class (src/data/world/terrain.js)
//         footprint: [fw, fh],     // tiles
//         overhang_px, hover_px,   // declared overhang; a flier's lift
//         shadow,                  // 'ellipse' | 'cast' | 'none'
//         nine: [l, t, r, b],      // roofs only: 9-slice insets, px
//       },
//     },
//   }
//
// SPRITE ID CONVENTIONS the renderer looks up:
//   <prop id>               a PROPS row (barrel, pine, ...); a tree adds
//                           '<id>:canopy' for its crown
//   hero                    the local hero's idle frame
//   wall:<material>:<side>  one 1-tile wall slice; side is s|n|w|e|sw|se|nw|ne
//   door:<material>         a door in a wall of that material
//   roof:<kind>             a roof, 9-sliced over the building's rect
//   wang:<terrain>:<0-15>   a corner-Wang overlay tile, transparent where the
//                           corner is not <terrain> (bit order in core/wang.js)
// ════════════════════════════════════════════════════════════════════════

export const ATLAS_SETS = Object.freeze({});
