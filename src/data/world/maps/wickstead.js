// src/data/world/maps/wickstead.js — the farm ground: a burned farmstead on the Thicket road, where the Meadowbrook leaves the wood.
// Row shape and lint: src/world/core/map-compile.js. Rebuild the hash with
// `node tests/world-core.mjs --hashes` after changing what blocks a step.
//
// THE GRID (designer 2026-10-28, lane b-greenhaven-6, authored for KIT §4b like the Thicket and the Glade): the
// Meadowbrook ('~') runs north to south past the farm, so the stead is two banks. Six yards on a loop joined by
// 3-wide lanes: on the west bank the Rick Yard (in from the Thicket road) and the Granary, over the farm's
// footbridge (y8, x28-31: the map's ONE 1-tile choke) the Barn, the Orchard and the Burned House, then back over
// the cattle ford (y30-32, three wide) to the Cart Shed. Every open tile lies in an open 3x3 except the
// footbridge. The hedges and the wood ('#') block a step and a shot and count as trees.
//
// ART: STAGED (src/data/hunts.js `staged`; this map is in STAGED_MAPS). Its ground `wickstead_ground` is not painted
// yet: the asset lane paints it from these rows in the Meadowbrook's tileset family (as the Glade's 4589f28b was),
// with a dirt track along the route. Every placed object is an existing style-1 sprite (mill, sewer, common,
// cottage, forest and warren sets). The four creatures reuse shipped style-1 units, the same animal under a new
// row (as the Drain Rat is the cellar's Giant Rat): Granary Rat = rat, Barn Wasp = hive_wasp, Barn Spider =
// cistern_spider, Turncoat = glade_poacher (hunt-grounds.js header).
//
// The pockets, packs, pull tiles and route are src/data/hunt-grounds.js `wickstead`;
// `spawns` here lists every pack tile at full density so the map lint proves each is open floor.
export default Object.freeze({
  id: 'wickstead',
  name: 'Wickstead',
  kind: 'hunt',
  hunts: Object.freeze(['wickstead']),
  outdoor: true,
  light: 'day',
  ground: 'wickstead_ground',
  legend: Object.freeze({ '#': 'thicket', '.': 'grass', '~': 'brook', '=': 'planks', ':': 'grass' }),
  rows: Object.freeze([
    '############################~~~~############################',
    '############################~~~~############################',
    '####...................#####~~~~####....................####',
    '####...................#####~~~~####....................####',
    '####...................#####~~~~####....................####',
    '####...................#####~~~~####....................####',
    '####........................~~~~........................####',
    '####........................~~~~........................####',
    '####........................====........................####',
    '####........................~~~~........................####',
    '############...#######......~~~~........................####',
    '############...#############~~~~####....................####',
    '############...#############~~~~###############...##########',
    '######................######~~~~###############...##########',
    '######................######~~~~###############...##########',
    '######................######~~~~###############...##########',
    '######................######~~~~######....................##',
    '######................######~~~~######....................##',
    '......................######~~~~######....................##',
    '......................######~~~~######....................##',
    '......................######~~~~######....................##',
    '......................######~~~~######....................##',
    '......................######~~~~######....................##',
    '######................######~~~~######....................##',
    '######................######~~~~######....................##',
    '######................######~~~~######....................##',
    '######................######~~~~############...#############',
    '##########...###############~~~~############...#############',
    '##########...###############~~~~############...#############',
    '####...................#####~~~~####....................####',
    '####........................::::........................####',
    '####........................::::........................####',
    '####........................::::........................####',
    '####...................#####~~~~####....................####',
    '####...................#####~~~~####....................####',
    '####...................#####~~~~####....................####',
    '####...................#####~~~~####....................####',
    '####...................#####~~~~####....................####',
    '############################~~~~############################',
    '############################~~~~############################',
  ]),
  faces: Object.freeze([]),
  objects: Object.freeze([
    /* the gather nodes (hunt-grounds.js `gather`, INERT until the gather engine lands): the full sprite on each node's tile */
    { id: 'pine', x: 7, y: 14 }, { id: 'pine', x: 20, y: 14 }, { id: 'pine', x: 7, y: 25 },
    { id: 'pine', x: 5, y: 3 }, { id: 'pine', x: 21, y: 3 }, { id: 'pine', x: 5, y: 9 },
    { id: 'oak', x: 39, y: 17 }, { id: 'oak', x: 56, y: 17 }, { id: 'oak', x: 39, y: 24 }, { id: 'oak', x: 56, y: 24 },
    { id: 'pine', x: 5, y: 35 }, { id: 'pine', x: 21, y: 35 }, { id: 'pine', x: 12, y: 37 },
    /* the yard's scatter: a pine in the open rick yard */
    { id: 'pine', x: 18, y: 23 },
    /* the crossings: the farm's footbridge (the one 1-tile choke) and the ford stones */
    { id: 'cw_plank_bridge', x: 29, y: 8 }, { id: 'mb_stepping_stones', x: 29, y: 31 }, { id: 'mb_stepping_stones', x: 30, y: 30 },
    /* P0 the Rick Yard: the hay the rats nest in */
    { id: 'hay_bale', x: 8, y: 16 }, { id: 'hay_bale', x: 9, y: 16 }, { id: 'straw', x: 19, y: 24 }, { id: 'sack_pile', x: 20, y: 17 },
    { id: 'grain_spill', x: 10, y: 24 },
    /* P1 the Granary: split sacks and spilled grain */
    { id: 'sack_stack', x: 8, y: 3 }, { id: 'sack_pile', x: 10, y: 3 }, { id: 'grain_spill', x: 18, y: 7 }, { id: 'crates', x: 7, y: 8 },
    /* P2 the Barn: the loft the spiders took */
    { id: 'web', x: 37, y: 3 }, { id: 'web', x: 54, y: 3 }, { id: 'hay_bale', x: 38, y: 10 }, { id: 'straw', x: 53, y: 10 },
    /* P3 the Orchard: old trees, and the wasps' nests in them */
    { id: 'wasp_nest', x: 52, y: 16 }, { id: 'mb_leaf_litter', x: 42, y: 22 }, { id: 'mb_flowers', x: 54, y: 22 },
    /* P4 the Burned House: the turncoats sleep in what is left of it */
    { id: 'cracked_flagstone', x: 40, y: 31 }, { id: 'cracked_flagstone', x: 50, y: 31 }, { id: 'cracked_flagstone', x: 40, y: 35 },
    { id: 'cracked_flagstone', x: 50, y: 35 }, { id: 'corner_rubble', x: 37, y: 30 }, { id: 'corner_rubble', x: 54, y: 36 },
    { id: 'barrel_broken', x: 38, y: 36 }, { id: 'bone_pile', x: 53, y: 30 }, { id: 'brazier', x: 42, y: 30 },
    /* P5 the Cart Shed: a robbed cart and the farm's woodpile */
    { id: 'collapsed_cart', x: 7, y: 30 }, { id: 'woodpile', x: 19, y: 30 }, { id: 'chopping_block', x: 17, y: 30 }, { id: 'barrels', x: 21, y: 31 },
  ]),
  buildings: Object.freeze([]),
  path: Object.freeze([[3, 19], [8, 19], [8, 21], [3, 21]]),
  spawns: Object.freeze([
    [15, 18], [16, 19], [15, 20], [14, 19], [16, 18], [16, 20], [14, 20], [14, 18],
    [14, 4], [15, 5], [14, 6], [13, 5], [15, 4], [15, 6], [13, 6], [13, 4],
    [46, 5], [47, 6], [46, 7], [45, 6], [47, 5], [47, 7], [45, 7], [45, 5],
    [48, 19], [49, 20], [48, 21], [47, 20], [49, 19], [49, 21], [47, 21], [47, 19],
    [45, 32], [46, 33], [45, 34], [44, 33], [46, 32], [46, 34], [44, 34], [44, 32],
    [13, 32], [14, 33], [13, 34], [12, 33], [14, 32], [14, 34], [12, 34], [12, 32],
  ]),
  stations: Object.freeze({}),
  exits: Object.freeze([{ x: 0, y: 20, to: 'town_common' }]),
  start: Object.freeze([1, 20]),
  maskHash: 'cfd94222',
});
