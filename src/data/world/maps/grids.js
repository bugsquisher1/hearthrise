// src/data/world/maps/grids.js — THE ENGINE'S MAP INDEX: the walkable terrain of every map a hunt is fought on, and
// nothing a renderer draws (architecture audit 2026-11-18, item 4).
//
// The engine reads a map through src/core/hunt-ground.js (the hr-accrue edge's settle and the browser's live view) and
// takes its `rows` through its `legend`, nothing else. The renderer's index (./index.js) holds every map whole, and
// through it the edge payload shipped Havora's buildings, stations, trees, wear, palisade, scree and piers
// (../town/*.js, ../stations.js) and the 64 px sandbox: about 68 KB the server never reads. This index holds only
// { id, rows, legend }, taken from the same row and legend objects (never a copy), for exactly the maps a ground names
// (src/data/hunt-grounds.js groundOfHunt): the hunt maps below, every ground pack's map (open or staged) and, for
// training, the town and the home.
//
// A NEW HUNT MAP is its file in this folder, a row in ./index.js and a row here. tests/edge-bundle.mjs fails until the
// two indexes agree on every ground's map (EB-5..EB-7), and its ceiling (EB-1) fails if the edge reaches ./index.js again.
//
// PURE ESM, Node + Deno + browser.
import millCellar from './mill_cellar.js?v=0.2.142';
import homeCottage from './home_cottage.js?v=0.2.142';
import millraceSewer from './millrace_sewer.js?v=0.2.142';
import meadowbrookThicket from './meadowbrook_thicket.js?v=0.2.142';
import coppercapWarrens from './coppercap_warrens.js?v=0.2.142';
import mosslightGlade from './mosslight_glade.js?v=0.2.142';
import wickstead from './wickstead.js?v=0.2.142';
import burningTower from './burning_tower.js?v=0.2.142';
import { TOWN_MAP } from '../town/plan.js?v=0.2.142';
import { GROUND_ROWS, GROUND_LEGEND } from '../town/ground.js?v=0.2.142';
import { GROUND_PACKS } from '../../grounds/index.js?v=0.2.142';

const terrain = (id, rows, legend) => Object.freeze({ id, rows, legend });

const GRIDS = new Map();
for (const m of [millCellar, homeCottage, millraceSewer, meadowbrookThicket, coppercapWarrens, mosslightGlade, wickstead, burningTower,
  ...GROUND_PACKS.map((p) => p.map)]) GRIDS.set(m.id, terrain(m.id, m.rows, m.legend));
/* Havora is built from ../town/*.js; its terrain is the ground's rows and legend alone. */
GRIDS.set(TOWN_MAP, terrain(TOWN_MAP, GROUND_ROWS, GROUND_LEGEND));

/** The terrain { id, rows, legend } of map `id` when a hunt can be fought on it, or null: the engine's grid reader. */
export function gridMapOf(id) {
  return GRIDS.get(id) || null;
}
