// ════════════════════════════════════════════════════════════════════════
// src/data/world/town/sites.js — HAVORA'S BUILDINGS, SCENERY AND WAYS OUT.
//
// Plan coordinates (town/plan.js); maps/town_common.js turns them into the
// map row. What a station is built of (counters, forges, trees, rocks) is the
// station's own `props` (../stations.js), never repeated here.
//
// SITES: a building of Blueprint v0.5 x2 that has no style-1 art yet is a
// PLACEHOLDER FOOTPRINT: a painted, closed building (map-compile.js) on `site`
// ground, drawn as a flat dark block (--world-ground-site-*). It blocks a step
// like the building will; its door is where its front will be. The art lane
// replaces each one with a whole style-1 sprite in SCENERY whose footprint is the
// lot (lane/b-havora-art-2, 2026-10-26: every lot has its art, art/world/havora).
// [id, x, y, w, h, door side, door offset?] — the door sits mid-side ('s' south … 'w' west), or
// `offset` tiles along that side from its north-west end.
//
// HEARTH SQUARE'S RING (lane/b-hearth-art, 2026-10-25). Every hall is drawn facing SOUTH (the camera), so a
// building only opens onto the square from its NORTH side: the shop (square_general_store) and the storage
// (square_depot) stand side by side there, their counters on y36 facing the fire; the kill-task hunter's
// barracks takes the south lot (the depot's in the blueprint), its door yard south of it. The store and the
// barracks no longer overlap (the blueprint drew one over the other at x116-123).
// PURE ESM. Display data only.
// ════════════════════════════════════════════════════════════════════════

export const SITES = Object.freeze([
  /* every lot of Blueprint v0.5 x2 has its style-1 art (SCENERY, art/world/havora): no placeholder footprint is left */
].map((r) => Object.freeze(r)));

/* the buildings and things with style-1 art, in plan coordinates (a sprite's footprint from its x, y) */
export const SCENERY = Object.freeze([
  /* HEARTH SQUARE: the Great Hearth (footprint 11 x 4, x112-122 y45-48; its fire is the map's ambient loop),
     the ring of halls, the market stalls (trade, later), the benches, and the wear of the paving */
  ['great_hearth', 112, 45],
  ['square_general_store', 106, 30], ['square_depot', 118, 30], ['square_bank', 113, 16], ['square_barracks', 108, 66],
  ['square_market_stall', 129, 44], ['square_market_stall', 129, 48], ['square_market_stall', 129, 52], ['square_market_stall', 129, 56],
  ['square_bench_wood', 123, 55], ['square_bench_stone', 125, 55], ['square_bench_log', 127, 55],
  ['square_bench_stone', 123, 58], ['square_bench_wood', 125, 58], ['square_bench_log', 127, 58],
  ['square_decal_soot', 115, 51], ['square_decal_chips_a', 120, 51], ['square_decal_puddle_a', 104, 53], ['square_decal_moss_a', 131, 59],
  ['square_decal_leaves_a', 110, 58], ['square_decal_tuft_a', 103, 59],
  ['lamppost', 105, 57], ['lamppost', 123, 43], ['lamppost', 101, 47],
  /* the smithy and the mill (whole sprites) and their yards */
  ['smithy', 76, 38], ['npc_smith', 78, 43], ['flower_bed', 79, 45],
  ['mill', 89, 28], ['hatch', 88, 34], ['barrels', 86, 30], ['flour_sack', 87, 30], ['water_trough', 86, 33], ['hay_bale', 87, 33],
  ['floor_grate', 46, 67],
  /* HAVORA'S LOTS (art/world/havora, lane/b-havora-art-2): the gatehouse (every overground hunt leaves from its yard),
     the tavern on P07 over its cook yard, the bridge over the river (walked on: its cells stay planks) */
  ['havora_gatehouse', 75, 5], ['havora_tavern', 62, 20], ['havora_bridge', 88, 48],
  /* lane/b-havora-polish: the gate road's bridge over the mill race (the road east to the bank no longer runs into the water)
     and the south road's bridge to the hunter's yard (its deck spans the river's bend below P10) */
  ['havora_bridge', 89, 15], ['havora_bridge', 86, 72],
  ['havora_guild_hall', 116, 72], ['havora_sewer_works', 44, 56], ['havora_fisher_guild', 66, 78], ['havora_harbor_office', 98, 76],
  /* the homes: the crooked shacks NW (P01-P06), the town lots (P09-P10), the mountain (P11) and the waterfront estates (P13-P15) */
  ['havora_home_p01', 16, 14], ['havora_home_p02', 30, 16], ['havora_home_p03', 46, 14], ['havora_home_p04', 20, 36],
  ['havora_home_p05', 36, 38], ['havora_home_p06', 48, 66], ['havora_home_p09', 68, 54], ['havora_home_p10', 88, 62],
  ['havora_home_p11', 132, 20], ['havora_home_p12', 132, 46], ['havora_home_p13', 120, 74], ['havora_home_p14', 142, 66], ['havora_home_p15', 138, 80],
  /* the mine's mouth in the mountain, a fishing pier off the shore */
  ['mine_mouth', 138, 34], ['fishing_pier', 60, 94],
  /* the cook yard's stores, the training yard's rack, the farm's crates */
  ['sack_pile', 74, 31], ['barrel_planter', 58, 31], ['weapon_rack', 78, 63], ['turnip_crate', 19, 82],
  ['well', 99, 40], ['signpost', 9, 47],
  /* THE EAST QUAY (lane/a-havora-dock 2026-10-26): the estates' yard between P14 and P15, a lane of beaten earth from
     the road down to the end of P13's dock, cargo where the dock meets the lane */
  ['crates', 133, 82], ['barrels', 133, 83], ['sack_stack', 138, 74], ['cart_wheel', 139, 74], ['barrels', 157, 79], ['crates', 157, 74],
  ['lamppost', 139, 79],
  /* THE WORK YARDS' CLUTTER (lane/b-havora-polish 2026-10-26), between the stations' pieces (../stations.js) so a yard
     reads as worked in: each forge's quench trough (west of it) and bellows (east), a tool rack, charcoal sacks, crates
     and barrels between the units; the cook yard's
     barrels, flour and a bucket; hay, an armour stand and barrels round the training dummies; the quarry's spoil by the mine
     mouth (a broken barrel, sacks, a wheel, rubble) and loose stone round the heaps; a woodpile and a chopping block at the Westwood's edge; hay,
     a basket, sacks and a trough among the farm plots */
  ['water_trough', 62, 37], ['bellows', 64, 37], ['water_trough', 67, 38], ['bellows', 69, 38], ['water_trough', 60, 42], ['bellows', 62, 42],
  ['water_trough', 65, 43], ['bellows', 67, 43], ['weapon_rack', 65, 37], ['crates', 70, 38], ['sack_pile', 59, 43], ['barrels', 64, 42],
  ['barrels', 72, 32], ['flour_sack', 74, 34], ['bucket', 66, 33],
  ['hay_bale', 70, 67], ['armour_stand', 59, 66], ['barrels', 77, 69],
  ['barrel_broken', 137, 36], ['sack_tall', 136, 35], ['cart_wheel', 142, 38],
  ['corner_rubble', 142, 36], ['pebbles', 147, 34], ['pebbles', 157, 37], ['havora_scree_b', 156, 43], ['havora_scree_a', 150, 36],
  ['havora_scree_c', 146, 38], ['pebbles', 152, 33], ['havora_scree_d', 157, 35], ['corner_rubble', 151, 42], ['pebbles', 159, 41],
  ['havora_scree_a', 154, 46], ['pebbles', 149, 47], ['havora_scree_b', 144, 40],
  ['woodpile', -5, 45], ['chopping_block', -3, 44],
  ['hay_bale', 53, 83], ['basket', 30, 84], ['water_trough', 53, 87], ['sack_stack', 44, 84],
  /* THE ARRIVAL YARD south of the gatehouse (heroes back from a hunt stand at x78-89 y16-19, stations.js): lamps
     flanking the gate, a carter's corner of crates, sacks and a spare wheel against the tavern wall, the trough and
     hay for the horses and a well by the mill race, and a signpost on the road south toward Hearth Square */
  ['lamppost', 79, 15], ['lamppost', 88, 15],
  ['crates', 74, 15], ['crates', 75, 15], ['barrels', 74, 16], ['sack_stack', 75, 16], ['cart_wheel', 76, 15],
  ['water_trough', 90, 21], ['hay_bale', 89, 21], ['well', 91, 22],
  ['lamppost', 79, 23], ['signpost', 86, 27], ['crates', 90, 26],
].map((r) => Object.freeze(r)));

/* the ways out of town onto a hunting ground's map: the mill's cellar hatch, the sewer grate */
export const EXITS = Object.freeze([
  Object.freeze({ x: 88, y: 34, to: 'mill_cellar' }), Object.freeze({ x: 46, y: 67, to: 'millrace_sewer' }),
]);

/* the districts whose painted ground has landed (map-compile.js `patches`): Hearth Square's paving, 24 x 24, framed by its kerb */
export const PATCHES = Object.freeze([Object.freeze({ terrain: 'havora_square_plaza', rect: Object.freeze([106, 36, 24, 24]) })]);

/* THE GROUND (map-compile.js `blend`): the Common family's wang16 pairs, every one chained from the same grass
   and dirt tiles (art/world/common/havora_*: recovered from the painted Common grounds; square_*_flag: the
   square's flagstone sets). The cobble lanes draw as flagstone until a cobble pair exists. */
export const BLEND = Object.freeze({
  pairs: Object.freeze(['havora_grass_earth', 'havora_grass_water', 'square_grass_flag', 'square_dirt_flag',
    /* lane/b-havora-art-2 (art/world/havora): the docks' and bridge's planks, the farm plots, the mountain's rock */
    'havora_earth_planks', 'havora_water_planks', 'havora_grass_tilled', 'havora_grass_rock', 'havora_earth_rock',
    /* lane/b-havora-polish: the quarry's gravel floor against the rock and the cart path */
    'havora_gravel_rock', 'havora_earth_gravel',
    /* lane/a-havora-dock: the stone quay where the dirt meets the water, the rocky shore under the mountain */
    'havora_water_quay', 'havora_water_rock']),
  alias: Object.freeze({ cobble: 'flagstone', palisade: 'grass' }),
});

/* looping effects the map places (map-compile.js `ambient`): the Great Hearth's fire over its firebox,
   tile (117, 48) lifted 86 art px (the hearth frame's px (176, 262), sidecar art/world/common/hearth_fire.json) */
export const AMBIENT = Object.freeze([Object.freeze({ id: 'hearth_fire', x: 117, y: 48, lift: 86 })]);
