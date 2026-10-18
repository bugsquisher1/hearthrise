// ════════════════════════════════════════════════════════════════════════
// src/data/world/house-layouts.js — WHAT YOUR HOME LOOKS LIKE, FROM WHAT YOU OWN.
//
// HOUSE_TEMPLATES: which home map a property rung shows (the server's
// `property:` rung, HearthriseProperty.serverPropertyTier). The last row whose
// `fromTier` is at or below the rung wins; an unknown rung shows the first. The
// cottage stands in for every rung until a farmstead or manor map is drawn —
// adding one is a map file plus a row here.
//
// ROOM_LAYOUTS[map].rooms[roomId]: the furniture each rung of a room adds
// (`rungs[k]` is what rung k+1 adds; a room at rung r shows rungs 1..r). Rung 0
// shows a signpost on the first rung's first tile, pointing at the House
// screen. A rung beyond the authored list shows the whole list. Every room in
// the game's ROOMS table must have a row here with one entry per rung
// (tests/world-town-home.mjs), and the layout must lint as a map with every
// piece and every signpost placed at once (no overlap, nothing north of a
// south wall, every open tile still reachable).
//
// trophyMounts: the wall tiles where claimed bestiary trophies hang, highest
// stage first (HearthriseTrophies.wallRows), shown once the Trophy Room is
// built; TROPHY_MOUNT_SPRITES picks the mount by trophy stage.
// Display data only. Whole tiles, the map row's coordinates.
// ════════════════════════════════════════════════════════════════════════

const p = (id, x, y) => Object.freeze({ id, x, y });
const room = (rungs) => Object.freeze({ rungs: Object.freeze(rungs.map((r) => Object.freeze(r))) });

export const HOUSE_TEMPLATES = Object.freeze([
  Object.freeze({ id: 'cottage', map: 'home_cottage', fromTier: 0 }),
]);

export const TROPHY_MOUNT_SPRITES = Object.freeze({ 1: 'shield_wall', 2: 'banner', 3: 'swords_wall', 4: 'trophy_wolf' });

export const ROOM_LAYOUTS = Object.freeze({
  home_cottage: Object.freeze({
    building: 'cottage',
    trophyMounts: Object.freeze([[5, 1], [6, 1], [4, 1], [3, 1], [11, 1], [12, 1]]),
    rooms: Object.freeze({
      kitchen: room([[p('hearth', 7, 2)], [p('bucket', 9, 2)], [p('herbs_hanging', 9, 1)], [p('counter', 5, 2)], [p('basket', 6, 3)]]),
      library: room([[p('bookshelf', 11, 2)], [p('desk', 11, 4)], [p('chair_side', 10, 4)], [p('candelabra', 12, 3)], [p('bookshelf', 10, 2)]]),
      trophy: room([[p('weapon_rack', 4, 2)], [p('armour_stand', 3, 6)], [p('display_case', 3, 7)], [p('dummy', 3, 8)], [p('swords_wall', 10, 1)]]),
      cellar: room([[p('barrels', 12, 8)], [p('apple_crate', 11, 8)], [p('flour_sack', 10, 8)], [p('sack_pile', 12, 7)], [p('sack_tall', 12, 6)]]),
      garden: room([[p('flower_bed', 16, 6)], [p('flower_bed', 17, 6)], [p('hedge', 19, 6)], [p('barrel_planter', 20, 6)], [p('bush', 21, 6)]]),
      forge: room([[p('forge', 16, 8)], [p('bellows', 17, 8)], [p('anvil', 18, 8)], [p('grindstone', 15, 8)], [p('barrel_stack', 19, 8)]]),
      workshop: room([[p('workbench', 16, 10)], [p('crates', 17, 10)], [p('chopping_block', 18, 10)], [p('cabbage_crate', 19, 10)], [p('cart_wheel', 15, 10)]]),
      shrine: room([[p('altar', 17, 13)], [p('candelabra', 16, 13)], [p('candelabra', 18, 13)], [p('candle', 17, 12)], [p('statue', 19, 13)]]),
    }),
  }),
});
