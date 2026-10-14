// ════════════════════════════════════════════════════════════════════════
// src/data/world/terrain.js — WHAT A MAP TILE IS MADE OF, AND WHAT STANDS ON IT.
//
// Two tables the world maps (src/data/world/maps/*.js) name by id:
//
//   TERRAIN  one row per ground material a legend character maps to.
//            solid  blocks walking (it is in the collision mask).
//            layer  autotile order: higher layers are drawn over lower ones,
//                   each as a corner-Wang overlay (src/world/core/wang.js).
//            wall   a solid terrain with a face: it stands up out of the
//                   ground like a building wall (the cellar's rock).
//            stub   which --world-stub-* token paints it until real art lands.
//
//   PROPS    one row per placeable object. A map places a prop by WHOLE TILE
//            ({ id, x, y } and nothing else; the lint rejects offsets).
//            class      the art-budget class its frame is sized by.
//            footprint  [w, h] in tiles, anchored at its north-west tile; the
//                       art's contact row sits on the footprint's south edge.
//            solid      in the collision mask.
//            light      a point light it casts (radius in tiles, tint token).
//            canopy     a tree: the trunk is y-sorted, the crown draws above
//                       units and fades while the hero stands under it.
//            furniture  may not stand on the row directly north of a south wall.
//
// PURE ESM, no DOM. Display data only: nothing here is a server number.
// ════════════════════════════════════════════════════════════════════════

export const TERRAIN = Object.freeze({
  floor_stone: Object.freeze({ solid: false, layer: 1, stub: 'floor-stone' }),
  floor_dirt: Object.freeze({ solid: false, layer: 2, stub: 'dirt' }),
  floor_plank: Object.freeze({ solid: false, layer: 3, stub: 'plank' }),
  grass: Object.freeze({ solid: false, layer: 1, stub: 'grass' }),
  path_dirt: Object.freeze({ solid: false, layer: 2, stub: 'dirt' }),
  cobble: Object.freeze({ solid: false, layer: 3, stub: 'cobble' }),
  water: Object.freeze({ solid: true, layer: 0, stub: 'water' }),
  rock: Object.freeze({ solid: true, layer: 4, stub: 'rock', wall: 'stone' }),
});

const prop = (cls, footprint, o = {}) => Object.freeze({
  class: cls, footprint: Object.freeze(footprint), solid: o.solid !== false,
  light: o.light ? Object.freeze(o.light) : null, canopy: !!o.canopy, furniture: !!o.furniture,
});

export const PROPS = Object.freeze({
  barrel: prop('barrel', [1, 1], { furniture: true }),
  crate: prop('crate', [1, 1], { furniture: true }),
  sacks: prop('crate', [1, 1], { furniture: true }),
  chest: prop('chest', [1, 1], { furniture: true }),
  table: prop('table', [1, 1], { furniture: true }),
  chair: prop('chair', [1, 1], { furniture: true, solid: false }),
  bed: prop('bed', [1, 2], { furniture: true }),
  hearth: prop('hearth', [2, 1], { furniture: true, light: { radius: 3, tint: 'torch' } }),
  rug: prop('decal', [2, 1], { solid: false }),
  bones: prop('small', [1, 1], { solid: false }),
  mushrooms: prop('small', [1, 1], { solid: false }),
  torch: prop('torch', [1, 1], { solid: false, light: { radius: 3, tint: 'torch' } }),
  hatch: prop('hatch', [1, 1], { solid: false }),
  well: prop('well', [1, 1]),
  woodpile: prop('crate', [1, 1]),
  anvil: prop('anvil', [1, 1]),
  board: prop('board', [1, 1]),
  bench: prop('bench', [1, 1], { solid: false }),
  lamppost: prop('lamppost', [1, 1], { light: { radius: 3, tint: 'torch' } }),
  bush: prop('bush', [1, 1]),
  pine: prop('tree', [1, 1], { canopy: true }),
});
