// src/data/world/maps/burning_tower.js — THE BURNING TOWER'S ROOM: one floor of the flue, the room every floor of the climb is fought in.
// Row shape and lint: src/world/core/map-compile.js. Rebuild the hash with `node tests/world-core.mjs --hashes` after changing what
// blocks a step. The climb's rules: src/data/tower.js; its ground row: src/data/hunt-grounds.js TOWER_GROUNDS.
//
// THE GRID (art director, lane/a-tower-art-gen 2026-11-16; round 5 "why is the tower lopsided": one flue, no side room). The Tower is
// the Great Hearth's chimney: a ring of soot brick round a floor of cold ash, every floor the same room. The room is ONE round shaft,
// x23-37 y14-25, mirror-symmetric about x30, its curve cut in steps (5, 9, 11, 13, then 15 wide, and back). The stair comes up from the
// floor below at the south, onto the iron landing inside the shaft (x27-33 y23-25, the Keepers' riveted plate where the ash is swept
// off), and the way on up is the iron rungs in the north wall above x30: the climb runs up the axis. The fight is on the ash: a BRIGHT
// ground (median #8a867d, the Pyre Field's ash, chained) so the Tower's charred bodies read 3:1 by their ring
// (tools/world-art/tower-pours.mjs --check).
//   '#' the flue's brick mass (rock: blocks a step and a shot)
//   '.' the ash floor (earth)
//   'i' the iron landing (setts: walked)
//
// THE ENGINE FIGHTS HERE: TOWER_GROUNDS (src/data/hunt-grounds.js) names this map, its pocket the whole flue, the five slots on the
// ash in an arc under the irons (the Keeper's slot on the axis), the four seats on the ash at the landing's lip.
//
// ART: set `tower` (tools/world-art/tower-flue.mjs): the floor painted from these rows on the flue family (the iron plate, the Pyre
// Field's ash chained, run to the walls), the soot-brick walls laid over the paint with an ember-cracked face every sixth cell from the
// axis, and the kit's props in mirrored pairs (the flue's own seven: art/world/tower/tower_*, PixelLab, 2026-11-16).
export default Object.freeze({
  id: 'burning_tower',
  name: 'The Burning Tower',
  kind: 'hunt',
  hunts: Object.freeze(['the_burning_tower']),
  outdoor: false,
  light: 'indoor',
  ground: 'burning_tower_ground',
  legend: Object.freeze({ '#': 'rock', '.': 'earth', i: 'setts' }),
  rows: Object.freeze([
    '############################################################', // 0
    '############################################################',
    '############################################################',
    '############################################################',
    '############################################################',
    '############################################################', // 5
    '############################################################',
    '############################################################',
    '############################################################',
    '############################################################',
    '############################################################', // 10
    '############################################################',
    '############################################################',
    '############################################################',
    '############################.....###########################', //    the flue's north curve; the climbing irons in the wall above x30
    '##########################.........#########################', // 15
    '#########################...........########################',
    '########################.............#######################',
    '#######################...............######################',
    '#######################...............######################',
    '#######################...............######################', // 20
    '#######################...............######################',
    '########################.............#######################',
    '#########################...iiiii...########################', //    the iron landing: the stair from the floor below comes up at x30 y25
    '##########################.iiiiiii.#########################',
    '############################iiiii###########################', // 25
    '############################################################',
    '############################################################',
    '############################################################',
    '############################################################',
    '############################################################', // 30
    '############################################################',
    '############################################################',
    '############################################################',
    '############################################################',
    '############################################################', // 35
    '############################################################',
    '############################################################',
    '############################################################',
    '############################################################',
  ]),
  faces: Object.freeze([]),
  /* THE SWEEP'S GEAR, IN MIRRORED PAIRS ROUND THE CURVE, clear of the fight (the five slots and the four seats, x25-35 y16-22): on the
     axis, the climbing irons in the north wall (the way on up), a soot door in the wall either side of them, the Stokers' barrow and
     rake below; at the upper curve the sweep's brush on its rods and a chimney pot fallen from the top; two heaps of swept ash still
     holding embers against the side walls; his sacks of soot and the coal scuttle at the lower curve; and the Hold's braziers lighting
     the landing either side of the stair */
  objects: Object.freeze([
    { id: 'tower_climbing_irons', x: 30, y: 13 }, { id: 'tower_soot_door', x: 27, y: 14 }, { id: 'tower_soot_door', x: 33, y: 14 },
    { id: 'ma_ash_barrow', x: 26, y: 15 }, { id: 'ma_fire_rake', x: 34, y: 15 },
    { id: 'tower_sweep_brush', x: 24, y: 17 }, { id: 'tower_chimney_pot', x: 36, y: 17 },
    { id: 'tower_ash_heap', x: 23, y: 20 }, { id: 'tower_ash_heap', x: 37, y: 20 },
    { id: 'tower_soot_sacks', x: 24, y: 22 }, { id: 'tower_coal_scuttle', x: 36, y: 22 },
    { id: 'kh_brazier', x: 26, y: 24 }, { id: 'kh_brazier', x: 34, y: 24 },
  ]),
  buildings: Object.freeze([]),
  /* the patrol loop round the room's middle */
  path: Object.freeze([[26, 18], [34, 18], [34, 21], [26, 21]]),
  /* the Tower's pocket slots and seats (hunt-grounds.js TOWER_GROUNDS), so the lint proves each is open floor here */
  spawns: Object.freeze([[30, 16], [27, 17], [33, 17], [25, 19], [35, 19], [30, 21], [29, 21], [31, 21], [30, 22]]),
  stations: Object.freeze({}),
  /* the stair down, at the landing's south edge on the axis */
  exits: Object.freeze([{ x: 30, y: 25, to: 'town_common' }]),
  start: Object.freeze([30, 21]),
  maskHash: 'b15ed2a1',
});
