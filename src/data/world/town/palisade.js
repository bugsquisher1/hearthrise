// src/data/world/town/palisade.js — HAVORA'S WALL: the style-1 palisade laid on every palisade cell of the ground.
// The wall is a band two tiles thick (ground.js '|'). An east-west run lays one 32 px slice of the same log strip per
// column (havora_palisade_h<column mod 8>, footprint 1 x 2 on the band's top row), a north-south run one slice per row
// (havora_palisade_v<row mod 8>, footprint 2 x 1 on the band's west column), so each run reads as one unbroken wall.
// Plan coordinates [id, x, y] (town/plan.js). The cells stay palisade: what blocks a step is unchanged.
// PURE ESM. Display data only.
import { GROUND_ROWS } from './ground.js?v=0.2.47';
import { WEST } from './plan.js?v=0.2.47';

const wall = (x, y) => y >= 0 && y < GROUND_ROWS.length && GROUND_ROWS[y][x] === '|';
function lay() {
  const out = [];
  for (let y = 0; y < GROUND_ROWS.length; y++) {
    for (let x = 0; x < GROUND_ROWS[y].length; x++) {
      if (!wall(x, y)) continue;
      const run = wall(x - 1, y) && wall(x + 1, y) || (wall(x - 1, y) && wall(x - 2, y)) || (wall(x + 1, y) && wall(x + 2, y));
      if (run && wall(x, y + 1) && !wall(x, y - 1)) out.push(Object.freeze(['havora_palisade_h' + (x % 8), x - WEST, y]));
      else if (!run && wall(x + 1, y) && !wall(x - 1, y)) out.push(Object.freeze(['havora_palisade_v' + (y % 8), x - WEST, y]));
    }
  }
  return Object.freeze(out);
}
export const PALISADE = lay();
