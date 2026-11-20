// src/data/world/maps/town_common.js — HAVORA, the real town: Town Blueprint v0.5 x2 plus the Westwood (192 x 116).
// Row shape and lint: src/world/core/map-compile.js. Rebuild the hash with
// `node tests/world-core.mjs --hashes` after changing what blocks a step.
//
// The plan (docs/planning/PRIORITY_BOARD.md "Real town plan (2026-10-25)") is authored in plan
// coordinates in ../town/*.js and ../stations.js; this file only puts it together:
//   ground     ../town/ground.js (the blueprint's ground, traced x2, with the plan's districts, and its legend)
//   buildings  ../town/sites.js SITES: PLACEHOLDER FOOTPRINTS (painted, closed: they block a step,
//              their art is the art lane's) on `site` ground; none is left (every lot is a SCENERY sprite)
//   objects    the road wear (../town/wear.js), the style-1 scenery (every building and lot a whole sprite), every
//              station's props, the trees of the green ground, the palisade (../town/palisade.js), the piers (../town/piers.js) and the
//              mountain's scree (../town/mountain.js)
//   stations   one stand of each kind the map lint checks (combat, gather, artisan, idle); every
//              station and its full stand list is ../stations.js
// ART: the town has no one ground (ground: null). Its ground is BLENDED from the Common family's wang16
// pairs (BLEND in ../town/sites.js: grass, the dirt roads, the river and sea banks, the flagstone
// yards, all one tileset family chained from the same grass and dirt tiles), drawn on the dual grid
// (compose.js blendTiles); Hearth Square's paving is a patch over it. A material no pair draws yet
// (a placeholder site) stays a placeholder tone.
import { at, TOWN_NAME, TOWN_MAP } from '../town/plan.js?v=0.2.143';
import { GROUND_ROWS, GROUND_LEGEND } from '../town/ground.js?v=0.2.143';
import { SITES, SCENERY, SHOWPIECES, EXITS, PATCHES, AMBIENT, BLEND } from '../town/sites.js?v=0.2.143';
import { GREENERY } from '../town/greenery.js?v=0.2.143';
import { WEAR } from '../town/wear.js?v=0.2.143';
import { PALISADE } from '../town/palisade.js?v=0.2.143';
import { SCREE } from '../town/mountain.js?v=0.2.143';
import { PIERS } from '../town/piers.js?v=0.2.143';
import { STATIONS, STATION_BY_ID, ACTIVITY_STATIONS } from '../stations.js?v=0.2.143';

const tile = (x, y) => { const [mx, my] = at(x, y); return { x: mx, y: my }; };
/** A placeholder footprint: a painted, closed building with its door mid-side. */
function site([id, x, y, w, h, side, offset]) {
  const [mx, my] = at(x, y);
  const along = (n) => (Number.isInteger(offset) ? offset : n >> 1);
  const door = side === 's' ? [mx + along(w), my + h - 1] : side === 'n' ? [mx + along(w), my]
    : side === 'w' ? [mx, my + along(h)] : [mx + w - 1, my + along(h)];
  return Object.freeze({ id, rect: Object.freeze([mx, my, w, h]), doors: Object.freeze([Object.freeze(door)]), painted: true, closed: true });
}
const first = (id) => STATION_BY_ID[id].stands[0];

export default Object.freeze({
  id: TOWN_MAP,
  name: TOWN_NAME,
  kind: 'town',
  hunts: Object.freeze([]),
  outdoor: true,
  light: 'day',
  ground: null,
  legend: GROUND_LEGEND,
  rows: GROUND_ROWS,
  blend: BLEND,
  patches: Object.freeze(PATCHES.map((p) => Object.freeze({ terrain: p.terrain, rect: Object.freeze(at(p.rect[0], p.rect[1]).concat(p.rect[2], p.rect[3])) }))),
  /* daylight on the river, the mill race and the harbour (src/world/core/ambient.js); the chimneys smoke wherever the homes stand */
  life: Object.freeze(['water']),
  ambient: Object.freeze(AMBIENT.map((a) => Object.freeze(Object.assign({ id: a.id, lift: a.lift }, ('dx' in a && a.dx) ? { dx: a.dx } : {}, tile(a.x, a.y))))),
  /* the landmarks the camera frames when the hero stands near them (src/world/core/camera.js showAt) */
  shows: Object.freeze(SHOWPIECES.map((s) => Object.freeze(Object.assign({ id: s.id }, tile(s.x, s.y),
    { near: Object.freeze(at(s.near[0], s.near[1]).concat(s.near[2], s.near[3])), fade: s.fade })))),
  faces: Object.freeze([]),
  objects: Object.freeze([
    ...SCENERY.map(([id, x, y]) => Object.freeze(Object.assign({ id }, tile(x, y)))),
    ...STATIONS.flatMap((s) => s.props),
    ...GREENERY.map(([id, x, y]) => Object.freeze(Object.assign({ id }, tile(x, y)))),
    ...PALISADE.map(([id, x, y]) => Object.freeze(Object.assign({ id }, tile(x, y)))),
    ...SCREE.map(([id, x, y]) => Object.freeze(Object.assign({ id }, tile(x, y)))),
    ...PIERS.map(([id, x, y]) => Object.freeze(Object.assign({ id }, tile(x, y)))),
    ...WEAR.map(([id, x, y]) => Object.freeze(Object.assign({ id: 'square_decal_' + id }, tile(x, y)))),
  ]),
  buildings: Object.freeze(SITES.map(site)),
  path: Object.freeze([]),
  spawns: Object.freeze([]),
  stations: Object.freeze({ combat: first(ACTIVITY_STATIONS.training), gather: first(ACTIVITY_STATIONS.gather.woodcutting),
    artisan: first(ACTIVITY_STATIONS.artisan.smithing), idle: first(ACTIVITY_STATIONS.idle) }),
  exits: Object.freeze(EXITS.map((e) => Object.freeze(Object.assign({ to: e.to }, tile(e.x, e.y))))),
  /* the lint's reach origin: the gatehouse's first stand (a hero back from a hunt arrives on one of the
     gatehouse's stands, the one the SERVER holds for it: 2027-01-28-town-stands.sql) */
  start: first(ACTIVITY_STATIONS.arrival),
  /* 29d47245 -> c9842f06: the mountain's edge redrawn in town/ground.js (lane/a-havora-rock 2026-11-17: bays and spurs of rock a cell or two
     deep where it ran on whole-tile rulers, and its two tiers into terraces; no stand, door, exit, way (plan.js WAYS) or placed thing moved, every open
     cell still reached; 46 rock cells opened, 55 open cells taken by rock)
     c9842f06 -> 9465b065: three rock cells under the mine road opened into the dirt (lane/a-havora-quarry: the road met the rock on a straight
     cut below the mine yard); no way, stand or placed thing moved
     9465b065 -> 73d6bf6b: the Hearth's fuel corners and the market's stalls no longer mirror or repeat (lane/fix137-hearth-chest-art, Tyler
     2026-11-17: "symmetry is kind of weird"): the east woodpile and fire bucket became the chopping block and the charcoal sacks, the east
     split log went, the fourth stall became a trader's stock; the gate and harbour yards' twin crates and barrels became other props in place.
     No way, stand or door moved; every open cell still reached
     73d6bf6b -> 1adfc0d6: the square's six identical benches became two benches and a flower barrel, a hay bale, a bench and a stool at
     uneven gaps over the same bench stands (three cells opened); no way, stand or door moved */
  maskHash: '1adfc0d6',
});
