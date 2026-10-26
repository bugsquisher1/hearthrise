// ════════════════════════════════════════════════════════════════════════
// src/data/world/town/sites.js — HAVORA'S BUILDINGS, SCENERY AND WAYS OUT.
//
// Plan coordinates (town/plan.js); maps/town_common.js turns them into the
// map row. What a station is built of (counters, forges, trees, rocks) is the
// station's own `props` (../stations.js), never repeated here.
//
// SITES: every building of Blueprint v0.5 x2 that has no style-1 art yet is a
// PLACEHOLDER FOOTPRINT: a painted, closed building (map-compile.js) on `site`
// ground, drawn as a flat dark block (--world-ground-site-*). It blocks a step
// like the building will; its door is where its front will be. The art lane
// replaces each one, district by district, with a whole style-1 sprite in
// SCENERY (so far: the smithy, the mill, Hearth Square's ring and the Great Hearth).
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
  /* the north: the gatehouse (every overground hunt), the tavern on P07 */
  ['gatehouse', 74, 10, 18, 10, 's'], ['tavern', 62, 20, 12, 8, 's'],
  /* the crooked shacks P01-P06 and the town lots P09-P10 */
  ['p01', 16, 14, 10, 8, 's'], ['p02', 30, 16, 12, 8, 's'], ['p03', 46, 14, 10, 8, 's'], ['p04', 20, 36, 10, 8, 's'],
  ['p05', 36, 38, 12, 8, 's'], ['p06', 48, 66, 10, 8, 'w'], ['p09', 68, 50, 12, 8, 'n'], ['p10', 88, 62, 14, 10, 'w'],
  /* the sewer works (its grate is the Sewer's way in), the fishers' guild */
  ['sewer_works', 44, 56, 14, 10, 'w'], ['fisher_guild', 66, 78, 16, 10, 's'],
  /* the harbor: its office and guild hall; the mountain homes P11-P12 and the waterfront estates P13-P15 */
  ['harbor_office', 98, 76, 16, 10, 's'], ['guild_hall', 116, 72, 4, 12, 's'],
  ['p11', 132, 20, 16, 10, 'w'], ['p12', 132, 46, 16, 10, 'w'], ['p13', 120, 74, 16, 8, 's'], ['p14', 142, 66, 18, 8, 'w'], ['p15', 138, 80, 20, 8, 's'],
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
  ['smithy', 76, 38], ['npc_smith', 78, 43], ['flower_bed', 74, 44],
  ['mill', 89, 28], ['hatch', 88, 34], ['barrels', 86, 30], ['flour_sack', 87, 30], ['water_trough', 86, 33], ['hay_bale', 87, 33],
  ['floor_grate', 46, 67],
  /* the mine's mouth in the mountain, a fishing pier off the shore */
  ['mine_mouth', 138, 34], ['fishing_pier', 60, 94],
  /* the cook yard's stores, the training yard's rack, the farm's crates */
  ['sack_pile', 74, 31], ['barrel_planter', 60, 30], ['weapon_rack', 78, 63], ['turnip_crate', 19, 82],
  ['well', 99, 40], ['signpost', 9, 47],
].map((r) => Object.freeze(r)));

/* the ways out of town onto a hunting ground's map: the mill's cellar hatch, the sewer grate */
export const EXITS = Object.freeze([
  Object.freeze({ x: 88, y: 34, to: 'mill_cellar' }), Object.freeze({ x: 46, y: 67, to: 'millrace_sewer' }),
]);

/* the districts whose painted ground has landed (map-compile.js `patches`): Hearth Square's paving, 24 x 24 */
export const PATCHES = Object.freeze([Object.freeze({ terrain: 'square_plaza', rect: Object.freeze([106, 36, 24, 24]) })]);

/* THE GROUND (map-compile.js `blend`): the Common family's wang16 pairs, every one chained from the same grass
   and dirt tiles (art/world/common/havora_*: recovered from the painted Common grounds; square_*_flag: the
   square's flagstone sets). The cobble lanes draw as flagstone until a cobble pair exists. */
export const BLEND = Object.freeze({
  pairs: Object.freeze(['havora_grass_earth', 'havora_grass_water', 'square_grass_flag', 'square_dirt_flag']),
  alias: Object.freeze({ cobble: 'flagstone' }),
});

/* looping effects the map places (map-compile.js `ambient`): the Great Hearth's fire over its firebox,
   tile (117, 48) lifted 86 art px (the hearth frame's px (176, 262), sidecar art/world/common/hearth_fire.json) */
export const AMBIENT = Object.freeze([Object.freeze({ id: 'hearth_fire', x: 117, y: 48, lift: 86 })]);
