// src/data/world/town/mountain.js — SCREE AND GRASS ON HAVORA'S MOUNTAIN: small flat boulder-and-scree decals and grass tufts, so the
// mountain is not one flat field of stone. Deterministic: a cell takes a decal when its hash picks it and no decal sits within two
// cells, so a rebuild lays the same stones. Plan coordinates.
//   on the rock    boulders over the cliff rock (ground.js '^', and its upper tier 'M'), now and then
//   at the foot    (lane/a-havora-rock 2026-11-17, Tyler's gate: "scree at the foot") the stones a cliff sheds: on the open ground
//                  right below a south face, about one cell in three, so the mountain's foot is littered and not ruled
//   in the cracks  (lane/a-havora-rock) grass tufts on the rock, one cell in a dozen or so, never two near
// PURE ESM. Display data only: decals are open, nothing here changes what blocks a step.
import { GROUND_ROWS } from './ground.js?v=0.2.140';
import { WEST } from './plan.js?v=0.2.140';
import { STATIONS } from '../stations.js?v=0.2.140';

const IDS = ['havora_scree_a', 'havora_scree_b', 'havora_scree_c', 'havora_scree_d'];
const TUFTS = ['square_decal_tuft_a', 'square_decal_tuft_b'];
const ROCK = '^M', FOOT = '.=,';
const hash = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 997;
/* a stand is never a prop (town-stations ST-2): no stone is laid on a tile a hero works on */
const STANDS = new Set(STATIONS.flatMap((s) => (s.stands || []).map(([x, y]) => x + ',' + y)));
function scatter() {
  const out = [], taken = new Set();
  const free = (x, y, r) => { if (STANDS.has(x + ',' + y)) return false; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (taken.has((x + dx) + ',' + (y + dy))) return false; return true; };
  const lay = (id, x, y) => { taken.add(x + ',' + y); out.push(Object.freeze([id, x - WEST, y])); };
  const at = (x, y) => (GROUND_ROWS[y] && GROUND_ROWS[y][x]) || '';
  /* the foot first: a cliff's shed stones are what the eye meets first */
  for (let y = 1; y < GROUND_ROWS.length; y++) {
    for (let x = 0; x < GROUND_ROWS[y].length; x++) {
      if (!FOOT.includes(at(x, y)) || at(x, y - 1) !== '^' || hash(x, y) % 3 !== 0 || !free(x, y, 2)) continue;
      lay(IDS[hash(y, x) % IDS.length], x, y);
    }
  }
  for (let y = 0; y < GROUND_ROWS.length; y++) {
    for (let x = 0; x < GROUND_ROWS[y].length; x++) {
      if (!ROCK.includes(at(x, y))) continue;
      if (hash(x, y) % 9 === 0 && free(x, y, 2)) lay(IDS[hash(y, x) % IDS.length], x, y);
      else if (hash(x, y) % 13 === 5 && free(x, y, 2)) lay(TUFTS[hash(y, x) % TUFTS.length], x, y);
    }
  }
  return Object.freeze(out);
}
export const SCREE = scatter();
