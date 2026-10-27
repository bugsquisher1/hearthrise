// src/data/world/town/mountain.js — SCREE ON HAVORA'S MOUNTAIN: small flat boulder-and-scree decals scattered over
// the cliff rock (ground.js '^') so the mountain is not one flat field of stone. Deterministic: a cell takes a decal
// when its hash picks it and no decal sits within two cells, so a rebuild lays the same stones. Plan coordinates.
// PURE ESM. Display data only: decals are open, nothing here changes what blocks a step.
import { GROUND_ROWS } from './ground.js?v=0.2.55';
import { WEST } from './plan.js?v=0.2.55';

const IDS = ['havora_scree_a', 'havora_scree_b', 'havora_scree_c', 'havora_scree_d'];
const hash = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 997;
function scatter() {
  const out = [], taken = new Set();
  for (let y = 0; y < GROUND_ROWS.length; y++) {
    for (let x = 0; x < GROUND_ROWS[y].length; x++) {
      if (GROUND_ROWS[y][x] !== '^' || hash(x, y) % 9 !== 0) continue;
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (taken.has((x + dx) + ',' + (y + dy))) { near = true; break; }
      if (near) continue;
      taken.add(x + ',' + y);
      out.push(Object.freeze([IDS[hash(y, x) % IDS.length], x - WEST, y]));
    }
  }
  return Object.freeze(out);
}
export const SCREE = scatter();
