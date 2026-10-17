// tests/hunt-core/grid.mjs — src/core/hunt/grid.js (parity GR-01..06). Run by tests/hunt-core/run-all.mjs.
import { suite } from './fixtures/h1.js';

const small = (M, rows) => M.grid.makeGrid(rows[0].length, rows.length, (x, y) => rows[y][x] === '.', (x, y) => rows[y][x] === '#');

const cases = {
  /* GR-01 */
  'walk-opaque': (M) => {
    const g = small(M, ['#.', '..']);
    if (M.grid.walkable(g, 0, 0) || !M.grid.walkable(g, 1, 0)) return 'walkable reads the wrong tile';
    if (!M.grid.isOpaque(g, 0, 0) || M.grid.isOpaque(g, 1, 1)) return 'opaque reads the wrong tile';
    if (M.grid.walkable(g, -1, 0) || !M.grid.isOpaque(g, 5, 5)) return 'outside the grid must be unwalkable and opaque';
    return null;
  },
  /* GR-02 */
  'distances': (M) => {
    const a = { x: 0, y: 0 }; const b = { x: 3, y: 4 };
    if (M.grid.cheb(a, b) !== 4) return 'cheb(0,0 → 3,4) should be 4';
    if (M.grid.dist2(a, b) !== 25) return 'dist2(0,0 → 3,4) should be 25';
    return null;
  },
  /* GR-03: (0,0) → (1,1) past a wall on (1,0) may not cut the corner. */
  'astar-no-corner-cut': (M) => {
    const g = small(M, ['.#', '..']);
    const p = M.grid.astar(g, 0, 0, 1, 1, null);
    if (!p || p.length !== 2 || p[0][0] !== 0 || p[0][1] !== 1) return 'expected [[0,1],[1,1]], got ' + JSON.stringify(p);
    const open = small(M, ['..', '..']);
    const q = M.grid.astar(open, 0, 0, 1, 1, null);
    if (!q || q.length !== 1) return 'an open diagonal should be one step, got ' + JSON.stringify(q);
    return null;
  },
  'path-null-when-sealed': (M) => {
    const g = small(M, ['..#..', '..#..']);
    if (M.grid.astar(g, 0, 0, 4, 0, null) !== null) return 'a sealed goal must answer null';
    const open = small(M, ['.....']);
    if (M.grid.astar(open, 0, 0, 4, 0, (x) => x === 2) !== null) return 'a blocked predicate must seal the corridor';
    if (JSON.stringify(M.grid.astar(open, 2, 0, 2, 0, null)) !== '[]') return 'start = goal must answer []';
    return null;
  },
  /* GR-04 */
  'los-blocked-by-wall': (M) => {
    const g = small(M, ['.....', '..#..', '.....']);
    if (M.grid.los(g, { x: 0, y: 1 }, { x: 4, y: 1 })) return 'a wall between must block sight';
    if (!M.grid.los(g, { x: 0, y: 0 }, { x: 4, y: 0 })) return 'an open row must see';
    if (!M.grid.los(g, { x: 2, y: 1 }, { x: 4, y: 1 })) return 'the end tiles are ignored';
    return null;
  },
  /* GR-05 / GR-06 */
  'free-near-and-ring': (M) => {
    const g = small(M, ['...', '...', '...']);
    const taken = (x, y) => x === 1 && y === 1;
    const f = M.grid.freeNear(g, 1, 1, 1, taken);
    if (!f || (f[0] === 1 && f[1] === 1)) return 'freeNear must skip the taken centre';
    const r = M.grid.ringFree(g, { x: 1, y: 1 }, 1, { x: 2, y: 2 }, null);
    if (JSON.stringify(r) !== '[2,2]') return 'ringFree nearest to (2,2) should be (2,2), got ' + JSON.stringify(r);
    return null;
  },
};

const mutants = [
  { name: 'A* cuts corners', case: 'astar-no-corner-cut',
    edits: [['src/core/hunt/grid.js', '      if (dx && dy && (!walkable(g, x + dx, y) || !walkable(g, x, y + dy))) continue;\n', '']] },
  { name: 'line of sight ignores walls', case: 'los-blocked-by-wall',
    edits: [['src/core/hunt/grid.js', '&& isOpaque(g, x, y)) return false;', '&& false) return false;']] },
];

await suite('hunt-core/grid', cases, mutants);
