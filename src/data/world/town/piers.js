// src/data/world/town/piers.js — HAVORA'S PIERS: the style-1 pier slices laid on every pier of the ground (lane/a-havora-dock
// round 3, 2026-10-27). A pier is a run of planks (ground.js '#') three columns wide running south into the water from the
// quay (';'); each of its rows lays one slice over the planks (span decals, footprint 3 x 1 on its west column): the root
// where it leaves the quay, a middle slice (three variants by row, so the boards and pilings never repeat in step) and the
// end at its head. Plan coordinates [id, x, y] (town/plan.js). The cells stay planks: what blocks a step is unchanged.
// PURE ESM. Display data only.
import { GROUND_ROWS } from './ground.js?v=0.2.73';
import { WEST } from './plan.js?v=0.2.73';

const at = (x, y) => (y >= 0 && y < GROUND_ROWS.length ? GROUND_ROWS[y][x] : '');
function lay() {
  const out = [];
  for (let y = 1; y < GROUND_ROWS.length; y++) {
    for (let x = 1; x + 2 < GROUND_ROWS[y].length; x++) {
      /* the pier's west column on this row: three planks wide with water either side */
      if (at(x, y) !== '#' || at(x + 1, y) !== '#' || at(x + 2, y) !== '#' || at(x - 1, y) !== '~' || at(x + 3, y) !== '~') continue;
      const root = at(x + 1, y - 1) === ';', end = at(x + 1, y + 1) === '~';
      if (!root && at(x + 1, y - 1) !== '#') continue;
      out.push(Object.freeze([root ? 'havora_pier_root' : end ? 'havora_pier_end' : 'havora_pier_mid' + (y % 3), x - WEST, y]));
      x += 2;
    }
  }
  return Object.freeze(out);
}
export const PIERS = lay();
