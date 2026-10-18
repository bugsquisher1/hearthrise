// src/data/world/maps/coppercap_warrens.js — the ore ground: the goblins' copper diggings.
// Row shape and lint: src/world/core/map-compile.js. Rebuild the hash with
// `node tests/world-core.mjs --hashes` after changing what blocks a step.
//
// THE GRID (designer 2026-10-18, authored for KIT §4b): down the adit into the Spoil Heap, east
// along the Copper Face to the Tool Store, over the Drop on a plank bridge (x51, y20-22: the map's
// ONE 1-tile choke), west through the Coal Gallery and the Foreman's Cut to the Chief's Hall, and
// back up the ore-cart ramp (x7-9). Corridors are 3 wide; the rock pillars split the big halls.
// Wall top and wall face are both rock ('#'): PixelLab draws the face in the row above the floor.
// The chasm ('~') blocks a step, not a shot; its two end lips are part of it.
//
// ART (style 1): the ground is PixelLab map d7bff9e2 (`warrens_ground`, art/world/warren), the
// cut-corner cave wall and the chasm painted from these rows. Ore veins are the gather nodes
// hunt-grounds.js `gather` lists, on the same tiles; torches hang on wall faces.
//
// The pockets, packs, pull tiles and route are src/data/hunt-grounds.js `coppercap_warrens`;
// `spawns` here lists every pack tile at full density so the map lint proves each is open floor.
export default Object.freeze({
  id: 'coppercap_warrens',
  name: 'Coppercap Warrens',
  kind: 'hunt',
  hunts: Object.freeze(['coppercap_warrens']),
  outdoor: false,
  light: 'cellar',
  ground: 'warrens_ground',
  legend: Object.freeze({ '#': 'rock', '.': 'earth', '~': 'chasm', '=': 'planks' }),
  rows: Object.freeze([
    '########...#################################################',
    '########...#################################################',
    '########...#################################################',
    '########...###################...#################.....#####',
    '########...###################...#################.....#####',
    '########...###################.............#######.....#####',
    '#######........###########.................#######.....#####',
    '#######........###########................................##',
    '###.............................###.......................##',
    '###.............................###.......................##',
    '###.....##......................###........####...........##',
    '###.....##...........#####..............#######...........##',
    '###.....##...........########...........#######........#####',
    '#####................########...........#########......#####',
    '#####............################################......#####',
    '#####............################################.........##',
    '#######...#####################################...........##',
    '#######...#####################################...........##',
    '#######...#####################################...........##',
    '#######...#####################################...........##',
    '#######...#####################################~~~~=~~~~~~##',
    '#######...#####################################~~~~=~~~~~~##',
    '#######...#####################################~~~~=~~~~~~##',
    '#######...#####################################...........##',
    '#######...#####################################...........##',
    '#####.......###################################...........##',
    '#####.......##############......###############...........##',
    '#####..........###########......############..............##',
    '##.............###########..........########..............##',
    '##.............#######......###.....########.....###......##',
    '##.............#######......###.....########.....###......##',
    '##...............................................###......##',
    '##........................................................##',
    '##......................................................####',
    '##.............#######..............########............####',
    '##.............#######..............########............####',
    '######.........##########........###############........####',
    '######...################...####################....########',
    '######...################...####################....########',
    '############################################################',
  ]),
  faces: Object.freeze([]),
  objects: Object.freeze([
    /* the gather nodes (hunt-grounds.js `gather`, INERT until the gather engine lands): the full sprite on each node's tile */
    { id: 'cw_copper_vein', x: 4, y: 9 }, { id: 'cw_copper_vein', x: 16, y: 13 }, { id: 'cw_copper_vein', x: 3, y: 11 }, { id: 'cw_copper_vein', x: 27, y: 7 },
    { id: 'cw_copper_vein', x: 41, y: 5 }, { id: 'cw_copper_vein', x: 30, y: 12 }, { id: 'cw_copper_vein', x: 39, y: 12 }, { id: 'cw_iron_vein', x: 56, y: 9 },
    { id: 'cw_iron_vein', x: 48, y: 11 }, { id: 'cw_coal_seam', x: 45, y: 28 }, { id: 'cw_coal_seam', x: 57, y: 27 }, { id: 'cw_coal_seam', x: 44, y: 35 },
    { id: 'cw_coal_seam', x: 57, y: 30 }, { id: 'cw_iron_vein', x: 22, y: 30 }, { id: 'cw_iron_vein', x: 35, y: 29 }, { id: 'cw_gold_seam', x: 2, y: 30 },
    { id: 'cw_gold_seam', x: 2, y: 34 },
    /* the Drop: the plank bridge (the one 1-tile choke) */
    { id: 'cw_plank_bridge', x: 51, y: 22 },
    /* torches on the wall faces, a brazier in the hall and at the heap */
    { id: 'wall_torch', x: 12, y: 5 }, { id: 'wall_torch', x: 31, y: 2 }, { id: 'wall_torch', x: 40, y: 4 }, { id: 'wall_torch', x: 52, y: 2 },
    { id: 'wall_torch', x: 50, y: 31 }, { id: 'wall_torch', x: 29, y: 30 }, { id: 'wall_torch', x: 5, y: 24 }, { id: 'wall_torch', x: 11, y: 24 },
    { id: 'brazier', x: 12, y: 34 }, { id: 'brazier', x: 5, y: 13 },
    /* mine timbers */
    { id: 'support_post', x: 20, y: 12 }, { id: 'support_post', x: 26, y: 6 }, { id: 'support_post', x: 42, y: 10 }, { id: 'support_post', x: 44, y: 27 },
    { id: 'support_post', x: 22, y: 29 },
    /* P0 the Spoil Heap: sacks, a wrecked cart, the rails up from the ramp */
    { id: 'sack_pile', x: 5, y: 14 }, { id: 'sack_pile', x: 14, y: 7 }, { id: 'collapsed_cart', x: 17, y: 8 }, { id: 'cw_rails', x: 8, y: 16 },
    { id: 'cw_rails', x: 8, y: 17 }, { id: 'cw_rails', x: 8, y: 18 }, { id: 'cw_rails', x: 8, y: 19 }, { id: 'cw_rails', x: 8, y: 20 },
    { id: 'cw_rails', x: 8, y: 21 }, { id: 'cw_rails', x: 8, y: 22 }, { id: 'cw_rails', x: 8, y: 23 }, { id: 'cw_rails', x: 8, y: 24 },
    /* P1 the Copper Face */
    { id: 'corner_rubble', x: 42, y: 5 }, { id: 'corner_rubble', x: 26, y: 10 }, { id: 'exposed_dirt', x: 34, y: 12 }, { id: 'exposed_dirt', x: 29, y: 7 },
    /* P2 the Tool Store: crates, barrels, the pick rack, stolen pots */
    { id: 'crates', x: 56, y: 16 }, { id: 'barrels', x: 48, y: 16 }, { id: 'cw_tool_rack', x: 51, y: 4 }, { id: 'cw_copper_pots', x: 48, y: 18 },
    { id: 'corner_rubble', x: 57, y: 7 },
    /* P3 the Coal Gallery */
    { id: 'exposed_dirt', x: 47, y: 33 }, { id: 'exposed_dirt', x: 50, y: 37 }, { id: 'corner_rubble', x: 56, y: 25 },
    /* P4 the Foreman's Cut */
    { id: 'corner_rubble', x: 26, y: 26 }, { id: 'mushrooms', x: 31, y: 34 }, { id: 'exposed_dirt', x: 33, y: 31 },
    /* P5 the Chief's Hall: the cart at the ramp foot, his throne between the gold */
    { id: 'cw_mine_cart', x: 6, y: 26 }, { id: 'cw_throne', x: 2, y: 32 }, { id: 'cw_copper_pots', x: 12, y: 27 }, { id: 'bones', x: 6, y: 36 },
    /* the floor scatter: stalagmites and spoil along the walls */
    { id: 'sack_pile', x: 51, y: 3 }, { id: 'cw_stalagmite', x: 36, y: 5 }, { id: 'cw_stalagmite', x: 54, y: 5 }, { id: 'cw_stalagmite', x: 11, y: 6 },
    { id: 'cw_stalagmite', x: 31, y: 8 }, { id: 'cw_stalagmite', x: 26, y: 11 }, { id: 'cw_stalagmite', x: 7, y: 12 }, { id: 'cw_stalagmite', x: 56, y: 15 },
    { id: 'cw_stalagmite', x: 47, y: 25 }, { id: 'cw_stalagmite', x: 11, y: 26 }, { id: 'cw_stalagmite', x: 14, y: 29 }, { id: 'cw_stalagmite', x: 31, y: 29 },
    { id: 'sack_pile', x: 48, y: 30 }, { id: 'cw_stalagmite', x: 14, y: 34 }, { id: 'sack_pile', x: 35, y: 35 }, { id: 'cw_stalagmite', x: 9, y: 36 },
    { id: 'cw_stalagmite', x: 28, y: 36 }, { id: 'cw_stalagmite', x: 32, y: 36 },
    /* the floor scatter: rubble, seep puddles and copper stains */
    { id: 'cw_rubble', x: 9, y: 7 }, { id: 'cw_puddle', x: 19, y: 10 }, { id: 'cw_puddle', x: 37, y: 12 }, { id: 'cw_puddle', x: 49, y: 12 },
    { id: 'cw_puddle', x: 52, y: 15 }, { id: 'cw_ore_stain', x: 49, y: 17 }, { id: 'cw_rubble', x: 56, y: 17 }, { id: 'cw_puddle', x: 52, y: 27 },
    { id: 'cw_ore_stain', x: 13, y: 29 }, { id: 'cw_puddle', x: 34, y: 29 }, { id: 'cw_rubble', x: 6, y: 34 }, { id: 'cw_ore_stain', x: 50, y: 36 },
  ]),
  buildings: Object.freeze([]),
  path: Object.freeze([[27, 9], [31, 9], [31, 11], [27, 11]]),
  spawns: Object.freeze([
    [13, 10], [14, 11], [13, 12], [12, 11], [14, 10], [14, 12], [12, 12], [12, 10],
    [37, 7], [38, 8], [37, 9], [36, 8], [38, 7], [38, 9], [36, 9], [36, 7],
    [52, 10], [53, 11], [52, 12], [51, 11], [53, 10], [53, 12], [51, 12], [51, 10],
    [53, 33], [54, 34], [53, 35], [52, 34], [54, 33], [54, 35], [52, 35], [52, 33],
    [26, 32], [27, 33], [26, 34], [25, 33], [27, 32], [27, 34], [25, 34], [25, 32],
    [7, 30], [8, 31], [7, 32], [6, 31], [8, 30], [8, 32], [6, 32], [6, 30],
  ]),
  stations: Object.freeze({}),
  exits: Object.freeze([{ x: 9, y: 0, to: 'town_common' }]),
  start: Object.freeze([9, 1]),
  maskHash: 'cdf4eb8a',
});
