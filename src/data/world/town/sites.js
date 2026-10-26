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
// (lane/b-hearth-art) replaces each one, district by district. Two buildings
// already have whole style-1 sprites (SCENERY): the smithy and the mill.
// [id, x, y, w, h, door side, door offset?] — the door sits mid-side ('s' south … 'w' west), or
// `offset` tiles along that side from its north-west end (the depot's opens onto the x110-111 aisle).
// PURE ESM. Display data only.
// ════════════════════════════════════════════════════════════════════════

export const SITES = Object.freeze([
  /* the north: the gatehouse (every overground hunt), the bank facade, the tavern on P07 */
  ['gatehouse', 74, 10, 18, 10, 's'], ['bank', 112, 12, 14, 10, 's'], ['tavern', 62, 20, 12, 8, 's'],
  /* Hearth Square: the shop, the kill-task hunter's barracks, the storage depot, four market stalls (trade, later), and
     the Great Hearth's footprint (11 x 4; its art is 11 x 11 tiles, y38-48), its door the firebox */
  ['general_store', 106, 24, 10, 12, 's'], ['guard_barracks', 116, 26, 14, 10, 's'], ['depot', 108, 60, 20, 12, 'n', 2],
  ['great_hearth', 112, 45, 11, 4, 's'],
  ['stall_1', 129, 44, 3, 3, 'w'], ['stall_2', 129, 48, 3, 3, 'w'], ['stall_3', 129, 52, 3, 3, 'w'], ['stall_4', 129, 56, 3, 3, 'w'],
  /* the crooked shacks P01-P06 and the town lots P09-P10 */
  ['p01', 16, 14, 10, 8, 's'], ['p02', 30, 16, 12, 8, 's'], ['p03', 46, 14, 10, 8, 's'], ['p04', 20, 36, 10, 8, 's'],
  ['p05', 36, 38, 12, 8, 's'], ['p06', 48, 66, 10, 8, 'w'], ['p09', 68, 50, 12, 8, 'n'], ['p10', 88, 62, 14, 10, 'w'],
  /* the sewer works (its grate is the Sewer's way in), the fishers' guild */
  ['sewer_works', 44, 56, 14, 10, 'w'], ['fisher_guild', 66, 78, 16, 10, 's'],
  /* the harbor: its office and guild hall; the mountain homes P11-P12 and the waterfront estates P13-P15 */
  ['harbor_office', 98, 76, 16, 10, 's'], ['guild_hall', 116, 72, 4, 12, 's'],
  ['p11', 132, 20, 16, 10, 'w'], ['p12', 132, 46, 16, 10, 'w'], ['p13', 120, 74, 16, 8, 's'], ['p14', 142, 66, 18, 8, 'w'], ['p15', 138, 80, 20, 8, 's'],
].map((r) => Object.freeze(r)));

/* the two buildings with style-1 art, their yards, and the town's fixtures, in plan coordinates */
export const SCENERY = Object.freeze([
  ['smithy', 76, 38], ['npc_smith', 78, 43], ['flower_bed', 74, 44],
  ['mill', 89, 28], ['hatch', 88, 34], ['barrels', 86, 30], ['flour_sack', 87, 30], ['water_trough', 86, 33], ['hay_bale', 87, 33],
  ['floor_grate', 46, 67],
  /* Hearth Square's lamps */
  ['lamppost', 105, 41], ['lamppost', 105, 57], ['lamppost', 123, 43],['lamppost', 101, 47],
  /* the cook yard's stores, the training yard's rack, the farm's crates */
  ['sack_pile', 74, 31], ['barrel_planter', 60, 30], ['weapon_rack', 78, 63], ['turnip_crate', 19, 82],
  ['well', 99, 40], ['signpost', 9, 47],
].map((r) => Object.freeze(r)));

/* the ways out of town onto a hunting ground's map: the mill's cellar hatch, the sewer grate */
export const EXITS = Object.freeze([
  Object.freeze({ x: 88, y: 34, to: 'mill_cellar' }), Object.freeze({ x: 46, y: 67, to: 'millrace_sewer' }),
]);
