// src/data/world/maps/burning_tower.js — THE BURNING TOWER'S ROOM: one floor of the flue, the room every floor of the climb is fought in.
// Row shape and lint: src/world/core/map-compile.js. Rebuild the hash with `node tests/world-core.mjs --hashes` after changing what
// blocks a step. The climb's rules: src/data/tower.js; its ground row: src/data/hunt-grounds.js TOWER_GROUNDS.
//
// THE GRID (art director, lane/a-tower-art-gen 2026-11-16). The Tower is the Great Hearth's chimney: a ring of soot brick round a floor
// of cold ash, every floor the same room. The room is a rounded shaft, x49-57 y15-32, its corners cut in steps so it reads as a flue and
// not a hall. The stair comes up from the floor below onto an iron landing at the west, x41-50 y21-25 (the Keepers' iron, riveted plate
// where the ash is swept off), and the way on up is the iron rungs in the north wall. The fight is on the ash: a BRIGHT ground (median
// #8a867d, the Pyre Field's ash, chained) so the Tower's charred bodies read 3:1 by their ring (tools/world-art/tower-pours.mjs --check).
//   '#' the flue's brick mass (rock: blocks a step and a shot)
//   '.' the ash floor (earth)
//   'i' the iron landing (setts: walked)
//
// ONE ROOM, TWO GRIDS UNTIL THE ROW MOVES. The engine still fights the climb on the Sewer's grid (TOWER_GROUNDS `map`: the Rat King's
// hall, x51-57 y18-29, its start and pocket cells). This room is laid so every cell the engine can walk there, and the hall's way west
// (x41-50 y21-25), is open floor here too: the scene shows this room and no unit ever stands in its brick. When the systems engineer
// moves the ground row to this map (a new hunt-sessions catalogue: HANDOFFS 2026-11-16), the room is the engine's too; nothing here
// changes.
//
// ART: set `tower` (tools/world-art/tower-flue.mjs): the floor painted from these rows on the flue family (the iron plate, the Pyre
// Field's ash chained, hearthstone patches the paint lays where the ash is thin), the soot-brick walls laid over the paint with an
// ember-cracked face every sixth cell, and the kit's props (the flue's own seven: art/world/tower/tower_*, PixelLab, 2026-11-16).
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
    '############################################################',
    '####################################################.....###', // 15 the shaft's north curve; the rungs above x54
    '###################################################.......##',
    '##################################################........##',
    '#################################################.........##',
    '#################################################.........##',
    '#################################################.........##', // 20
    '##########################################iiiiiiiii.......##', //    the iron landing, the stair from the floor below
    '#########################################iiiiiiiiii.......##',
    '#########################################iiiiiiiiii.......##',
    '#########################################iiiiiiiiii.......##',
    '##########################################iiiiiiiii.......##', // 25
    '#################################################.........##',
    '#################################################.........##',
    '#################################################.........##',
    '#################################################.........##',
    '##################################################........##', // 30
    '###################################################......###',
    '####################################################....####',
    '############################################################',
    '############################################################',
    '############################################################', // 35
    '############################################################',
    '############################################################',
    '############################################################',
    '############################################################',
  ]),
  faces: Object.freeze([]),
  /* the sweep's gear along the shaft's curves, clear of every cell the engine fights on (its pockets x51-57 y18-28, the way west): the
     climbing irons up the north wall (the way on up), a soot door in the landing's wall, the sweep's brush on its rods, his sacks of soot
     and the coal scuttle at the south curve, an ash heap still holding embers, a chimney pot fallen from the top; the Stokers' barrow and
     rake, and the Hold's braziers lighting the stair */
  objects: Object.freeze([
    { id: 'ma_ash_barrow', x: 52, y: 15 }, { id: 'ma_fire_rake', x: 56, y: 15 }, { id: 'tower_ash_heap', x: 53, y: 31 }, { id: 'tower_coal_scuttle', x: 56, y: 31 },
    { id: 'tower_sweep_brush', x: 50, y: 17 }, { id: 'kh_brazier', x: 43, y: 21 }, { id: 'tower_chimney_pot', x: 57, y: 17 },
    { id: 'tower_climbing_irons', x: 54, y: 14 }, { id: 'tower_soot_door', x: 46, y: 20 },
    { id: 'tower_soot_sacks', x: 55, y: 32 }, { id: 'kh_brazier', x: 48, y: 21 },
  ]),
  buildings: Object.freeze([]),
  /* the patrol loop round the room's middle */
  path: Object.freeze([[52, 20], [56, 20], [56, 27], [52, 27]]),
  /* the Tower's start and pocket cells (hunt-grounds.js TOWER_GROUNDS), so the lint proves each is open floor here */
  spawns: Object.freeze([[55, 23], [56, 18], [56, 28], [53, 18], [53, 28], [51, 23], [51, 22], [51, 24], [50, 23]]),
  stations: Object.freeze({}),
  exits: Object.freeze([{ x: 42, y: 23, to: 'town_common' }]),
  start: Object.freeze([51, 23]),
  maskHash: 'db4c1995',
});
