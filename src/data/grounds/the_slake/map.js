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
//   (the Grounded Barge is an object now: sl_grounded_barge at (27,20), footprint 10x3, art imported by lane/a-import-slake-art 2026-11-10;
//   the board drew a five-deep hull but the approved sprite is 312x95 px, so the two rows above it are open silt)
//
// ART (2026-11-10): the ground the_slake_ground is painted from these rows (art/briefs/the-slake-grid-2026-11-10.txt, set slake) on the copper
// silt pairs; the Mudlark, the barge, the Stake Nets run, the barge's spill and the river kit's wear decals are in set slake. Still waiting:
// the Greened Pikeman, the Bargeman and the Color Sergeant (no art yet) and the four gather oaks (a March tree node).
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
  legend: Object.freeze({ '#': 'thicket', '.': 'earth', ':': 'earth', '~': 'brook' }),
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
    '~~###########.............................................#~',
    '~~##########..............................................#~', //    P5 the Grounded Barge, P2 the Greenbar
    '~~##########..............................................#~', // 20
    '~~##########.............................................##~',
    '~~###########...........................................###~',
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
    /* THE ART (lane/a-import-slake-art, 2026-11-10). The Grounded Barge, signature 1: its hull sprite is 312 x 95 px (three tiles deep), so its
       footprint is 10 x 3 at the hull's south rows (y20-22) and the two rows above it are open silt again (the board drew five). */
    { id: 'sl_grounded_barge', x: 27, y: 20 },
    /* the barge's spill, west and south of the hull round the Grounded Barge pocket */
    { id: 'sl_grounded_barge_coal', x: 24, y: 19 }, { id: 'sl_grounded_barge_plank', x: 23, y: 22 }, { id: 'sl_grounded_barge_spar', x: 25, y: 24 }, { id: 'sl_grounded_barge_pitch', x: 26, y: 24 },
    /* the Stake Nets, signature 2: a run across the north-east bar beside the Stake Nets pocket */
    { id: 'sl_stake_nets', x: 43, y: 9 }, { id: 'sl_stake_nets', x: 45, y: 9 }, { id: 'sl_stake_nets', x: 47, y: 9 }, { id: 'sl_stake_nets_torn', x: 49, y: 9 }, { id: 'sl_stake_nets_snag', x: 51, y: 9 }, { id: 'sl_stake_nets_end', x: 53, y: 9 },
    /* the river kit and the March kit: the Tow Path's war-dead, the Mudlark Holes' helms, the posts and traps the silt keeps */
    { id: 'hf_pikes_fallen', x: 14, y: 9 }, { id: 'hf_banded_shield', x: 19, y: 6 }, { id: 'hf_helm_heap', x: 37, y: 34 }, { id: 'mr_mooring_post', x: 27, y: 10 }, { id: 'mr_mooring_post', x: 44, y: 26 }, { id: 'mr_eel_trap', x: 36, y: 25 }, { id: 'mr_drowned_pikes', x: 31, y: 25 },
    /* wear: silt stains, ripples, the company's harness and shields gone green, scattered about one to a dozen tiles and never twice alike in a row (ART_DIRECTION 5) */
    { id: 'mr_silt_stain', x: 12, y: 1 }, { id: 'mr_silt_ripples', x: 9, y: 2 }, { id: 'mr_silt_stain_small', x: 18, y: 2 }, { id: 'mr_silt_stain', x: 39, y: 2 }, { id: 'mr_silt_ripples', x: 23, y: 3 }, { id: 'mr_silt_stain_small', x: 36, y: 3 },
    { id: 'mr_green_harness', x: 45, y: 3 }, { id: 'mr_silt_ripples', x: 27, y: 4 }, { id: 'mr_silt_stain', x: 32, y: 4 }, { id: 'mr_greened_shield', x: 42, y: 4 }, { id: 'mr_silt_stain', x: 11, y: 6 }, { id: 'mr_silt_ripples', x: 15, y: 6 },
    { id: 'mr_silt_stain_small', x: 21, y: 6 }, { id: 'mr_silt_stain', x: 48, y: 6 }, { id: 'mr_silt_ripples', x: 8, y: 7 }, { id: 'mr_silt_stain_small', x: 37, y: 7 }, { id: 'mr_green_harness', x: 45, y: 7 }, { id: 'mr_silt_ripples', x: 24, y: 8 },
    { id: 'mr_silt_stain', x: 28, y: 8 }, { id: 'mr_greened_shield', x: 34, y: 8 }, { id: 'mr_silt_stain', x: 42, y: 8 }, { id: 'mr_silt_ripples', x: 13, y: 9 }, { id: 'mr_silt_stain_small', x: 17, y: 9 }, { id: 'mr_silt_stain', x: 53, y: 9 },
    { id: 'mr_silt_ripples', x: 31, y: 10 }, { id: 'mr_silt_stain_small', x: 38, y: 10 }, { id: 'mr_green_harness', x: 49, y: 10 }, { id: 'mr_silt_ripples', x: 21, y: 11 }, { id: 'mr_silt_stain', x: 18, y: 12 }, { id: 'mr_greened_shield', x: 41, y: 12 },
    { id: 'mr_silt_stain', x: 46, y: 12 }, { id: 'mr_silt_ripples', x: 24, y: 14 }, { id: 'mr_silt_stain_small', x: 16, y: 15 }, { id: 'mr_silt_stain', x: 27, y: 15 }, { id: 'mr_silt_ripples', x: 31, y: 15 }, { id: 'mr_silt_stain_small', x: 39, y: 15 },
    { id: 'mr_green_harness', x: 36, y: 16 }, { id: 'mr_silt_ripples', x: 51, y: 16 }, { id: 'mr_silt_stain', x: 20, y: 17 }, { id: 'mr_greened_shield', x: 43, y: 17 }, { id: 'mr_silt_stain', x: 48, y: 17 }, { id: 'mr_silt_ripples', x: 13, y: 18 },
    { id: 'mr_silt_stain_small', x: 17, y: 18 }, { id: 'mr_silt_stain', x: 25, y: 18 }, { id: 'mr_silt_ripples', x: 40, y: 18 }, { id: 'mr_silt_stain_small', x: 54, y: 18 }, { id: 'mr_green_harness', x: 45, y: 20 }, { id: 'mr_silt_ripples', x: 57, y: 20 },
    { id: 'mr_silt_stain', x: 15, y: 21 }, { id: 'mr_greened_shield', x: 20, y: 21 }, { id: 'mr_silt_stain', x: 24, y: 21 }, { id: 'mr_silt_ripples', x: 38, y: 21 }, { id: 'mr_silt_stain_small', x: 51, y: 21 }, { id: 'mr_silt_stain', x: 42, y: 22 },
    { id: 'mr_silt_ripples', x: 54, y: 22 }, { id: 'mr_silt_stain_small', x: 46, y: 23 }, { id: 'mr_green_harness', x: 21, y: 24 }, { id: 'mr_silt_ripples', x: 32, y: 24 }, { id: 'mr_silt_stain', x: 24, y: 25 }, { id: 'mr_greened_shield', x: 29, y: 25 },
    { id: 'mr_silt_stain', x: 38, y: 25 }, { id: 'mr_silt_ripples', x: 56, y: 25 }, { id: 'mr_silt_stain_small', x: 16, y: 26 }, { id: 'mr_silt_stain', x: 35, y: 26 }, { id: 'mr_silt_ripples', x: 42, y: 26 }, { id: 'mr_silt_stain_small', x: 47, y: 26 },
    { id: 'mr_green_harness', x: 52, y: 26 }, { id: 'mr_silt_ripples', x: 25, y: 28 }, { id: 'mr_silt_stain', x: 32, y: 28 }, { id: 'mr_greened_shield', x: 29, y: 29 }, { id: 'mr_silt_stain', x: 17, y: 30 }, { id: 'mr_silt_ripples', x: 21, y: 30 },
    { id: 'mr_silt_stain_small', x: 42, y: 30 }, { id: 'mr_silt_stain', x: 9, y: 31 }, { id: 'mr_silt_ripples', x: 13, y: 31 }, { id: 'mr_silt_stain_small', x: 26, y: 31 }, { id: 'mr_green_harness', x: 39, y: 31 }, { id: 'mr_silt_ripples', x: 47, y: 31 },
    { id: 'mr_silt_stain', x: 52, y: 31 }, { id: 'mr_greened_shield', x: 56, y: 31 }, { id: 'mr_silt_stain', x: 30, y: 32 }, { id: 'mr_silt_ripples', x: 36, y: 32 }, { id: 'mr_silt_stain_small', x: 6, y: 33 }, { id: 'mr_silt_stain', x: 33, y: 33 },
    { id: 'mr_silt_ripples', x: 44, y: 33 }, { id: 'mr_silt_stain_small', x: 3, y: 34 }, { id: 'mr_green_harness', x: 11, y: 34 }, { id: 'mr_silt_ripples', x: 18, y: 34 }, { id: 'mr_silt_stain', x: 24, y: 34 }, { id: 'mr_greened_shield', x: 41, y: 34 },
    { id: 'mr_silt_stain', x: 57, y: 34 }, { id: 'mr_silt_ripples', x: 21, y: 35 }, { id: 'mr_silt_stain_small', x: 29, y: 35 }, { id: 'mr_silt_stain', x: 47, y: 35 }, { id: 'mr_silt_ripples', x: 54, y: 35 }, { id: 'mr_silt_stain_small', x: 7, y: 37 },
    { id: 'mr_green_harness', x: 17, y: 37 }, { id: 'mr_silt_ripples', x: 26, y: 37 }, { id: 'mr_silt_stain', x: 35, y: 37 }, { id: 'mr_greened_shield', x: 40, y: 37 }, { id: 'mr_silt_stain', x: 44, y: 37 }, { id: 'mr_silt_ripples', x: 51, y: 37 },
    { id: 'mr_silt_stain_small', x: 13, y: 38 }, { id: 'mr_silt_stain', x: 22, y: 38 }, { id: 'mr_silt_ripples', x: 30, y: 38 },
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
  maskHash: 'f74c683b',
});
