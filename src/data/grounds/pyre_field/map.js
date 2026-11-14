// src/data/grounds/pyre_field/map.js — THE PYRE FIELD: the high field above the Muster Barrows where Lord Krell's Binders burned the
// Banded Company's dead. Row shape and lint: src/world/core/map-compile.js. Rebuild the hash with `node tests/world-core.mjs --hashes`
// after changing what blocks a step. Shape of the pack: src/data/grounds/shape.js.
//
// THE GRID (designer 2026-11-08, lane/b-pyre-field). The Ford is two banks and one crossing; the Slake three silt bars and two
// channels. The Pyre Field is one burnt field cut into three strips by two long rows of unlit pyres, the Great Pyre standing in the
// middle strip. Five gaps cross the rows, so the route is a ring round the Great Pyre and shutting any one gap strands nothing
// (checked: 1,613 open tiles, every one reachable from the road, every pull tile with a full box). The road comes in from the
// Muster Barrows at the south, x28-31.
//   '.' ash (earth: a burnt field, not a meadow, so the outdoor tree rule does not ask for trees on it)
//   ':' scorched earth, walked (earth; the painter lays the ash family's scorched-earth tiles here): the burn lines the Stokers
//       walked, the gaps in the pyre rows and the ring round the Great Pyre
//   '#' charred wood and the two pyre rows (thicket: blocks a step and a shot)
//   'o' a cinder pit, where a pyre burned all the way down (chasm: flat, blocks a step, hides nothing)
//   'P' THE GREAT PYRE, x25-34 y16-20, the ground's signature 1 (footprint 10x5). Blocked in the rows until its sprite loads; the art
//       import then swaps these cells to ash and places pf_great_pyre at (25,16), whose footprint blocks the same 50 tiles, so the
//       mask hash does not move.
//
// ART: STAGED. The ground `pyre_field_ground` is painted from these rows on the Barrow March kit's NEW ash family (the art plan's
// B4: ash, scorched earth, burnt grass, charred wood, cinder pit, and the March's grass where the field meets the barrows: six
// pairs). Every object placed below is on a loaded set; the four coal seams stand in for the gather node the ground wants (an
// emberstone vein: gathering.js emberstone_rock has no node kind or sprite yet, hunt-grounds.js GROUND_NODE_KINDS). Waiting on
// their sets: the burnt-out pyres (signature 2, pf_burnt_pyre and its variants) along both pyre rows at least every 10 tiles and
// round the cinder pits; the kit's hf_pyre_unlit and mu_bier_unburned in the Shroud Rows; mu_shields_leaning and hf_pikes_fallen at
// the Gate Pyres; the Stokers' iron rakes and log stacks in the Stokers' Yard.
//
// The pockets, packs, pull tiles and route are in ./pack.js `ground`; `spawns` here lists every pack tile at full density so the map
// lint proves each is open floor.
export default Object.freeze({
  id: 'pyre_field',
  name: 'The Pyre Field',
  kind: 'hunt',
  hunts: Object.freeze(['pyre_field']),
  outdoor: true,
  light: 'day',
  ground: 'pyre_field_ground',
  legend: Object.freeze({ '#': 'thicket', '.': 'earth', ':': 'earth', 'o': 'chasm', 'P': 'thicket' }),
  rows: Object.freeze([
    '############################################################', // 0
    '############################################################',
    '#######...................########...................#######',
    '#####................................................#######',
    '#####...............##................oo................####',
    '###.................##................oo................####', // 5
    '###.....................................................####',
    '###..............................##.....................####', //    P2 the Stokers' Yard, P3 the Kennels
    '###..............................##.....................####',
    '###..............................##................oo...####',
    '###.....................................oo.........oo....###', // 10
    '###.....................................oo...............###',
    '###......................................................###',
    '######:::::#############::::###################::::::#######', //    the north pyre row
    '######:::::#############::::###################::::::#######',
    '###.....................::::::::::::....................####', // 15
    '###.....................:PPPPPPPPPP:....................####',
    '###...........##........:PPPPPPPPPP:.......oo...........####',
    '###...........##........:PPPPPPPPPP:.......oo............###',
    '###.....................:PPPPPPPPPP:.....................###',
    '###.....................:PPPPPPPPPP:.....................###', // 20 P1 the Shroud Rows, the Great Pyre, P4 the Ash Heaps
    '###.....................::::::::::::.....................###',
    '###..........................::..........................###',
    '###..........................::......##..................###',
    '###..........................::......##.......oo......oo.###', //    P5 below the Great Pyre
    '###..........................::...............oo......oo.###', // 25
    '####.........................::..........................###',
    '#####:::::##########::::::########::::######################', //    the south pyre row
    '#####:::::##########::::::########::::######################',
    '####.........................::..........................###',
    '####.........................::..........................###', // 30
    '###..........................::........................#####',
    '###..........................::.........###............#####', //    P0 the Gate Pyres
    '###.............##...........::.........###............#####',
    '#####...........##...........::........................#####',
    '#####........................::...................##########', // 35
    '#########....................::...................##########',
    '#########....................::...................##########',
    '############################....############################', //    the road in from the Muster Barrows
    '############################....############################',
  ]),
  faces: Object.freeze([]),
  objects: Object.freeze([
    /* P0 the Gate Pyres: where the death carts tipped the company's dead to wait for a pyre */
    { id: 'bone_pile', x: 13, y: 30 }, { id: 'skull', x: 24, y: 35 }, { id: 'bones', x: 12, y: 34 }, { id: 'cart_wheel', x: 25, y: 31 },
    { id: 'collapsed_cart', x: 18, y: 36 },
    /* P1 the Shroud Rows: the dead laid out in their shrouds for a pyre that never came */
    { id: 'bone_pile', x: 5, y: 17 }, { id: 'bones', x: 12, y: 23 }, { id: 'skull', x: 19, y: 16 }, { id: 'sack_pile', x: 6, y: 24 },
    { id: 'bones', x: 17, y: 21 },
    /* P2 the Stokers' Yard: the Hold's wood and the block the Stokers split it on */
    { id: 'woodpile', x: 8, y: 10 }, { id: 'woodpile', x: 9, y: 10 }, { id: 'woodpile', x: 18, y: 3 }, { id: 'chopping_block', x: 11, y: 4 },
    { id: 'barrels', x: 23, y: 10 }, { id: 'sack_pile', x: 6, y: 6 },
    /* P3 the Kennels: the burnt-out pits the company's dogs den in, and what they dragged there */
    { id: 'bones', x: 42, y: 4 }, { id: 'bone_pile', x: 49, y: 5 }, { id: 'skull', x: 37, y: 9 }, { id: 'bones', x: 53, y: 11 },
    { id: 'bone_pile', x: 47, y: 10 },
    /* P4 the Ash Heaps: the pyres that burned down, and the company's pay in the ash */
    { id: 'bone_pile', x: 42, y: 20 }, { id: 'skull', x: 49, y: 25 }, { id: 'bones', x: 55, y: 17 }, { id: 'coins_scattered', x: 45, y: 22 },
    /* P5 below the Great Pyre: the officers' stores, carried up with them */
    { id: 'barrel_broken', x: 24, y: 25 }, { id: 'bones', x: 34, y: 23 }, { id: 'skull', x: 26, y: 22 }, { id: 'sack_pile', x: 33, y: 26 },
    /* the gather nodes (pack.js ground.gather): coal, the pyres' charcoal, until an emberstone vein node exists */
    { id: 'cw_coal_seam', x: 7, y: 4 }, { id: 'cw_coal_seam', x: 22, y: 8 }, { id: 'cw_coal_seam', x: 48, y: 16 }, { id: 'cw_coal_seam', x: 54, y: 20 },
    /* ash trees the fire took, at the field's edge */
    { id: 'westwood_ash', x: 4, y: 10 }, { id: 'westwood_ash', x: 54, y: 11 }, { id: 'westwood_ash', x: 36, y: 33 },
  ]),
  buildings: Object.freeze([]),
  /* the patrol loop, on the burn line by the road */
  path: Object.freeze([[27, 35], [32, 35], [32, 37], [27, 37]]),
  spawns: Object.freeze([
    [20, 31], [21, 32], [20, 33], [19, 32], [21, 31], [21, 33], [19, 33], [19, 31],
    [9, 19], [10, 20], [9, 21], [8, 20], [10, 19], [10, 21], [8, 21], [8, 19],
    [14, 6], [15, 7], [14, 8], [13, 7], [15, 6], [15, 8], [13, 8], [13, 6],
    [45, 6], [46, 7], [45, 8], [44, 7], [46, 6], [46, 8], [44, 8], [44, 6],
    [51, 20], [52, 21], [51, 22], [50, 21], [52, 20], [52, 22], [50, 22], [50, 20],
    [32, 23], [33, 24], [32, 25], [31, 24], [33, 23], [33, 25], [31, 25], [31, 23],
  ]),
  stations: Object.freeze({}),
  exits: Object.freeze([{ x: 29, y: 39, to: 'town_common' }]),
  start: Object.freeze([29, 38]),
  maskHash: '0482efed',
});
