// src/data/world/maps/sandbox_hd64.js — the 64 px sandbox (src/data/world/sandbox.js): a dirt
// lane, a well, a few props and room for the wanderer, on the hd64 grid (64 px tiles at x1).
// Row shape and lint: src/world/core/map-compile.js (L-GRID: no rock faces, no wall kit, no
// hunts on another grid). Rebuild the hash with `node tests/world-core.mjs --hashes`.
//
// ART: the hd64 round 3 finals (art/world/sandbox64): the knight and the rat (idle and walk), the
// well, barrel, pine, bush, rocks and sign, and the grass <-> packed dirt Wang ground laid by these
// rows' corners.
export default Object.freeze({
  id: 'sandbox_hd64',
  name: 'The Sandbox (64 px)',
  kind: 'sandbox',
  grid: 'hd64',
  hunts: Object.freeze([]),
  outdoor: true,
  light: 'day',
  ground: 'sandbox_ground',
  legend: Object.freeze({ '.': 'grass', ':': 'earth' }),
  rows: Object.freeze([
    '..........:::.................',
    '..........:::.................',
    '..........:::.................',
    '..........:::.................',
    '..........:::.................',
    '..........:::.................',
    '..........::::::::............',
    '::::::::::::::::::............',
    '::::::::::::::::::............',
    '::::::::::::::::::............',
    '..........::::::::............',
    '..........:::.................',
    '..........:::.................',
    '..........:::.................',
    '..........:::.................',
    '..........:::.................',
    '..........:::.................',
    '..........:::.................',
    '..........:::.................',
    '..........:::.................',
  ]),
  faces: Object.freeze([]),
  objects: Object.freeze([
    /* the green: a pine in every 12-tile window */
    { id: 'sandbox_pine', x: 5, y: 4 }, { id: 'sandbox_pine', x: 16, y: 4 }, { id: 'sandbox_pine', x: 27, y: 4 },
    { id: 'sandbox_pine', x: 5, y: 15 }, { id: 'sandbox_pine', x: 16, y: 15 }, { id: 'sandbox_pine', x: 27, y: 15 },
    /* the square: the well and its stores */
    { id: 'sandbox_well', x: 15, y: 8 }, { id: 'sandbox_barrel', x: 17, y: 6 },
    /* the edges */
    { id: 'sandbox_bush', x: 8, y: 5 }, { id: 'sandbox_bush', x: 21, y: 11 }, { id: 'sandbox_rocks', x: 7, y: 13 }, { id: 'sandbox_rocks', x: 24, y: 18 },
  ]),
  buildings: Object.freeze([]),
  path: Object.freeze([]),
  spawns: Object.freeze([]),
  stations: Object.freeze({}),
  exits: Object.freeze([]),
  start: Object.freeze([11, 12]),
  focus: Object.freeze([14, 10]),
  maskHash: '6350c507',
});
