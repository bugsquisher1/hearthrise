// src/data/world/maps/mill_cellar.js — the first hunt: the cellar under the mill.
// Row shape and lint: src/world/core/map-compile.js. Rebuild the hash with
// `node tests/world-core.mjs --hashes` after changing what blocks a step.
//
// ART (style 1, Tyler 10-18: no old art beside the new): the ground is PixelLab map
// a055f449 painted with the Sewer's cut-wall masonry (the cellar drains into it), so
// the walls are in the paint (`cellar_ground`, art/world/mill). The props are the
// Sewer kit's and the mill set's (a style-1 sheet): sacks, grain, the spare millstone.
export default Object.freeze({
  id: 'mill_cellar',
  name: 'Mill Cellar',
  kind: 'hunt',
  hunts: Object.freeze(['mill_cellar']),
  outdoor: false,
  light: 'cellar',
  ground: 'cellar_ground',
  legend: Object.freeze({ '#': 'rock', '.': 'earth' }),
  rows: Object.freeze([
    '########################',
    '########################',
    '########################',
    '###...................##',
    '###...................##',
    '###...................##',
    '###...................##',
    '###...................##',
    '###...................##',
    '###...................##',
    '###...................##',
    '###...................##',
    '########################',
    '########################',
  ]),
  faces: Object.freeze([]),
  objects: Object.freeze([
    /* the north wall: the stair up to the mill (the exit), two torches, a web and the wasps' nest */
    { id: 'ladder', x: 12, y: 2 }, { id: 'wall_torch', x: 6, y: 2 }, { id: 'wall_torch', x: 18, y: 2 },
    { id: 'web', x: 3, y: 2 }, { id: 'wasp_nest', x: 20, y: 2 },
    /* the mill's stores along the north wall */
    { id: 'sack_stack', x: 4, y: 3 }, { id: 'sack_pile', x: 5, y: 3 }, { id: 'barrels', x: 7, y: 3 },
    { id: 'crates', x: 9, y: 3 }, { id: 'barrel_stack', x: 15, y: 3 }, { id: 'sack_tall', x: 16, y: 3 },
    { id: 'flour_sack', x: 17, y: 3 }, { id: 'cart_wheel', x: 20, y: 3 }, { id: 'millstone', x: 19, y: 4 },
    { id: 'straw', x: 5, y: 4 }, { id: 'grain_spill', x: 9, y: 4 }, { id: 'grain_spill', x: 16, y: 4 },
    { id: 'chest', x: 21, y: 4 }, { id: 'candle', x: 20, y: 4 },
    /* the west corner: the drain the rats come up from (the way down to the Sewer) */
    { id: 'floor_grate', x: 4, y: 8 }, { id: 'barrel_broken', x: 3, y: 6 }, { id: 'straw', x: 3, y: 9 },
    { id: 'bone_pile', x: 4, y: 10 }, { id: 'skull', x: 5, y: 11 }, { id: 'mushrooms', x: 3, y: 11 },
    { id: 'moss_puddle', x: 4, y: 6 }, { id: 'pebbles', x: 8, y: 11 },
    /* the east wall: a rat-gnawed corner of turnips and old crates */
    { id: 'barrels', x: 21, y: 6 }, { id: 'turnip_crate', x: 21, y: 8 }, { id: 'bread_loaf', x: 21, y: 9 },
    { id: 'mushrooms', x: 21, y: 11 },
    /* the floor */
    { id: 'brazier', x: 14, y: 9 }, { id: 'cracked_flagstone', x: 9, y: 10 }, { id: 'exposed_dirt', x: 12, y: 8 },
    { id: 'moss_puddle', x: 16, y: 11 }, { id: 'coins_scattered', x: 18, y: 11 }, { id: 'grain_spill', x: 13, y: 6 },
  ]),
  buildings: Object.freeze([]),
  path: Object.freeze([[6, 5], [20, 5], [20, 10], [6, 10]]),
  spawns: Object.freeze([[11, 7], [13, 6], [5, 9], [16, 8], [19, 7], [19, 6], [17, 6], [5, 6]]),
  stations: Object.freeze({}),
  /* The drain in the west corner is where the cellar's rats come up from: the way
     down into the Millrace Sewer (src/data/hunt-tutorial.js, step "go_below"). */
  exits: Object.freeze([{ x: 12, y: 3, to: 'town_common' }, { x: 4, y: 8, to: 'millrace_sewer' }]),
  start: Object.freeze([10, 7]),
  /* The room the camera shows whole when the stage is big enough (tiles x, y, w, h):
     the floor from wall to wall, the north wall's face and the south wall. */
  frame: Object.freeze([3, 1, 19, 11]),
  maskHash: '13db71e4',
});
