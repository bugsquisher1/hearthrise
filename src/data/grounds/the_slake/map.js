// src/data/grounds/the_slake/map.js — THE SLAKE: the mudflat below Hask's Ford where the Meadowbrook slows and drops what it carries.
// Row shape and lint: src/world/core/map-compile.js. Rebuild the hash with `node tests/world-core.mjs --hashes` after changing
// what blocks a step. Shape of the pack: src/data/grounds/shape.js.
//
// THE GRID (designer 2026-11-07, lane/b-the-slake; drawn for the board's "2026-11-05 Ground Packs" section 4). The Ford is two
// banks and one crossing. The Slake is three silt bars and two deep channels with FOUR crossings, so the route is a ring and
// shutting any one crossing strands nothing (checked: 1,358 open tiles, every one reachable from the road and inside an open
// 3x3, every pull tile with a full box). The road comes in from the north at x12-15.
//   '.' silt (earth: a mudflat, not a meadow, so the outdoor tree rule does not ask for trees on it)
//   ':' the shallows, walked (earth; the painter lays the March's shallows tiles here)
//   '~' a deep channel (brook: flat water, blocks a step)
//   '#' reeds and the banks (thicket: blocks a step and a shot)
//   'B' THE GROUNDED BARGE's hull, x27-36 y18-22, the board's signature 1 (art brief 03, footprint 10x5). Blocked in the rows
//       until its sprite loads; the art import then swaps these cells to silt and places sl_grounded_barge at (27,18), whose
//       footprint blocks the same 50 tiles, so the mask hash does not move.
//
// ART: STAGED. The ground `the_slake_ground` is painted from these rows on the Barrow March kit's tilesets
// (src/data/world/region-kits.js barrow_march.families.march, with the copper silt pair of brief 04). Every object placed below
// is a kit prop on a loaded set, but the four gather oaks (the Ford's node kind, which the kit keeps off the March: they swap for a
// March tree node when one exists). Waiting on their sets (brief 04): the Stake Nets (signature 2) as a run of 4-6 across the
// north-east bar, x45-52 y7-9 beside the Stake Nets pocket; the barge's spill (sl_grounded_barge_coal, _spar, _pitch, _plank)
// west of the hull round the Grounded Barge pocket; the river kit's silt stains and ripples (mr_*) at least every 12 tiles of
// open silt; hf_helm_heap at the Mudlark Holes, hf_pikes_fallen and hf_banded_shield along the Tow Path.
//
// The pockets, packs, pull tiles and route are in ./pack.js `ground`; `spawns` here lists every pack tile at full density so
// the map lint proves each is open floor.
export default Object.freeze({
  id: 'the_slake',
  name: 'The Slake',
  kind: 'hunt',
  hunts: Object.freeze(['the_slake']),
  outdoor: true,
  light: 'day',
  ground: 'the_slake_ground',
  legend: Object.freeze({ '#': 'thicket', '.': 'earth', ':': 'earth', '~': 'brook', 'B': 'thicket' }),
  rows: Object.freeze([
    '############....############################################', // 0  the road in
    '###########.......##########################################',
    '#########...........################.........###############',
    '########......................................##############',
    '#######..........................................###########',
    '#######..........................................###########', // 5  P0 the Tow Path, P1 the Stake Nets
    '#######.......................###................###########',
    '########......................###.....................######',
    '#########.............................................######',
    '##########............................................######',
    '###########.....::::::.................::::::::.......######', // 10
    '~~~~~~~~~~~~~~~~::::::~~~~~~~~~~~~~~~~~::::::::~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~::::::~~~~~~~~~~~~~~~~~::::::::~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~::::::~~~~~~~~~~~~~~~~~::::::::~~~~~~~~~~~~~',
    '~~~~~~########..::::::...######~~~~~~~~::::::::...#######~~~',
    '~~~~#########.........................................####~~', // 15
    '~~~##########..........................................###~~',
    '~~###########..........................................###~~',
    '~~###########..............BBBBBBBBBB.....................#~',
    '~~##########...............BBBBBBBBBB.....................#~', //    P5 the Grounded Barge, P2 the Greenbar
    '~~##########...............BBBBBBBBBB.....................#~', // 20
    '~~##########...............BBBBBBBBBB....................##~',
    '~~###########..............BBBBBBBBBB...................###~',
    '~~#############..........................................#~~',
    '~~##############.........................................#~~',
    '~~~#############.......::::::::::.............:::::::....#~~', // 25
    '~~~~~###########.......::::::::::.............:::::::...##~~',
    '~~~~~~~~~~~~~~~~~~~~~~~::::::::::~~~~~~~~~~~~~:::::::~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~::::::::::~~~~~~~~~~~~~:::::::~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~::::::::::~~~~~~~~~~~~~:::::::~~~~~~~',
    '~~~~~~#####............::::::::::.............:::::::....###', // 30
    '####.....................................................###',
    '###..............................................###......##',
    '###...........###.............##................#####.....##',
    '###..........#####...........####................###......##', //    P4 the Low Flats, P3 the Mudlark Holes
    '####..........###.............##.........................###', // 35
    '#####...................................................####',
    '#######.................................................####',
    '###########.........................########################',
    '############################################################',
  ]),
  faces: Object.freeze([]),
  objects: Object.freeze([
    /* P0 the Tow Path: the bank the barge was hauled up, and what the haulers left */
    { id: 'cart_wheel', x: 10, y: 8 }, { id: 'sack_pile', x: 20, y: 3 }, { id: 'mb_fallen_log', x: 22, y: 8 }, { id: 'bones', x: 18, y: 9 },
    { id: 'skull', x: 11, y: 4 },
    /* P1 the Stake Nets: where the river's dead fetched up against the fishers' stakes */
    { id: 'bone_pile', x: 38, y: 8 }, { id: 'skull', x: 47, y: 4 }, { id: 'bones', x: 50, y: 8 },
    /* P2 the Greenbar: the bar the copper greens worst, and the company's pay still in it */
    { id: 'coins_scattered', x: 52, y: 22 }, { id: 'bone_pile', x: 44, y: 16 }, { id: 'skull', x: 54, y: 17 },
    /* P3 the Mudlark Holes: the scavengers' stash in the bank */
    { id: 'sack_pile', x: 36, y: 31 }, { id: 'barrel_broken', x: 45, y: 36 }, { id: 'bones', x: 37, y: 36 },
    /* P4 the Low Flats: a drowned ash on the south bank */
    { id: 'mb_fallen_log', x: 5, y: 31 }, { id: 'bone_pile', x: 12, y: 36 }, { id: 'westwood_ash', x: 20, y: 36 },
    /* P5 the Grounded Barge: the stores that came off the hull when its back broke */
    { id: 'barrels', x: 24, y: 17 }, { id: 'barrel_broken', x: 25, y: 21 }, { id: 'sack_pile', x: 16, y: 22 },
    /* the gather nodes (pack.js ground.gather): bank oaks, to swap for a March tree kind */
    { id: 'oak', x: 9, y: 4 }, { id: 'oak', x: 21, y: 8 }, { id: 'oak', x: 5, y: 34 }, { id: 'oak', x: 18, y: 32 },
    /* reeds where the silt meets deep water */
    { id: 'mb_reeds', x: 13, y: 10 }, { id: 'mb_reeds', x: 30, y: 10 }, { id: 'mb_reeds', x: 50, y: 10 }, { id: 'mb_reeds', x: 23, y: 14 },
    { id: 'mb_reeds', x: 48, y: 14 }, { id: 'mb_reeds', x: 18, y: 26 }, { id: 'mb_reeds', x: 38, y: 26 }, { id: 'mb_reeds', x: 54, y: 26 },
    { id: 'mb_reeds', x: 14, y: 30 }, { id: 'mb_reeds', x: 40, y: 30 },
  ]),
  buildings: Object.freeze([]),
  /* the patrol loop, on the bank by the road */
  path: Object.freeze([[12, 2], [16, 2], [16, 4], [12, 4]]),
  spawns: Object.freeze([
    [15, 5], [16, 6], [15, 7], [14, 6], [16, 5], [16, 7], [14, 7], [14, 5],
    [42, 5], [43, 6], [42, 7], [41, 6], [43, 5], [43, 7], [41, 7], [41, 5],
    [48, 18], [49, 19], [48, 20], [47, 19], [49, 18], [49, 20], [47, 20], [47, 18],
    [40, 33], [41, 34], [40, 35], [39, 34], [41, 33], [41, 35], [39, 35], [39, 33],
    [9, 33], [10, 34], [9, 35], [8, 34], [10, 33], [10, 35], [8, 35], [8, 33],
    [20, 18], [21, 19], [20, 20], [19, 19], [21, 18], [21, 20], [19, 20], [19, 18],
  ]),
  stations: Object.freeze({}),
  exits: Object.freeze([{ x: 13, y: 0, to: 'town_common' }]),
  start: Object.freeze([13, 1]),
  maskHash: '75e610b2',
});
