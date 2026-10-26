// src/data/world/town/palisade.js — HAVORA'S WALL: the style-1 palisade laid on every palisade cell of the ground.
// The wall is a band two tiles thick (ground.js '|'). An east-west run lays one 32 px slice of the same log strip per
// column (havora_palisade_h<columns from its west end mod 8>, footprint 1 x 2 on the band's top row) and ENDS ON A
// POST at both ends (havora_palisade_hw / _he<k>: the strip's thick post half a tile outside the run, so a run meets
// the gatehouse, the river bank or a corner on a post instead of a cut log). A north-south run lays one slice of a
// seamless 128 px loop per row (havora_palisade_v<rows from its north end mod 4>, footprint 2 x 1 on the band's west
// column); a free end shows the stake tips (north, havora_palisade_vn) or the feet (south, _vs). A north-south run
// that starts under an east-west run (a corner) runs on from behind it. Plan coordinates [id, x, y] (town/plan.js).
// The cells stay palisade: what blocks a step is unchanged.
// PURE ESM. Display data only.
import { GROUND_ROWS } from './ground.js?v=0.2.50';
import { WEST } from './plan.js?v=0.2.50';

const wall = (x, y) => y >= 0 && y < GROUND_ROWS.length && x >= 0 && GROUND_ROWS[y][x] === '|';
function lay() {
  const out = [];
  const put = (id, x, y) => out.push(Object.freeze([id, x - WEST, y]));
  const H = GROUND_ROWS.length, Wd = GROUND_ROWS[0].length;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < Wd; x++) {
      /* an east-west run: its west end, then every column to its east end */
      if (wall(x, y) && wall(x, y + 1) && !wall(x, y - 1) && !wall(x - 1, y) && wall(x + 1, y) && wall(x + 2, y)) {
        let e = x;
        while (wall(e + 1, y) && wall(e + 1, y + 1)) e++;
        for (let c = x; c <= e; c++) {
          const k = (c - x) % 8;
          put(c === x ? 'havora_palisade_hw' : c === e ? 'havora_palisade_he' + k : 'havora_palisade_h' + k, c, y);
        }
        x = e;
      }
    }
  }
  /* north-south runs: a two-wide band, column by column, below or apart from the east-west runs */
  const taken = new Set(out.map(([, px, py]) => (px + WEST) + ',' + py));
  const band = (x, y) => wall(x, y) && wall(x + 1, y) && !wall(x - 1, y) && !wall(x + 2, y)
    && !taken.has(x + ',' + y) && !taken.has(x + ',' + (y - 1)) && !taken.has((x + 1) + ',' + y) && !taken.has((x + 1) + ',' + (y - 1));
  for (let x = 0; x < Wd; x++) {
    for (let y = 0; y < H; y++) {
      if (!band(x, y) || band(x, y - 1)) continue;
      let s = y;
      while (band(x, s + 1)) s++;
      /* under a corner (an east-west run on the row above) the run goes on from behind it: no tips */
      const corner = wall(x, y - 1);
      for (let r = y; r <= s; r++) {
        const id = r === y && !corner ? 'havora_palisade_vn' : r === s && !wall(x, s + 1) ? 'havora_palisade_vs' : 'havora_palisade_v' + ((r - y) % 4);
        put(id, x, r);
      }
      y = s;
    }
  }
  return Object.freeze(out);
}
export const PALISADE = lay();
