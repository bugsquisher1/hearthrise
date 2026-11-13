// tests/hunt-core/grid.mjs — src/core/hunt/grid.js (parity GR-01..06). Run by tests/hunt-core/run-all.mjs.
import { suite } from './fixtures/h1.js';

const small = (M, rows) => M.grid.makeGrid(rows[0].length, rows.length, (x, y) => rows[y][x] === '.', (x, y) => rows[y][x] === '#');

/* THE PLAIN SEARCH, as src/core/hunt/grid.js ran it before lane/r-engine-profile (a reference, never a second engine path):
   the open list scanned whole for its minimum at every expansion, every unreachable goal searched to the end. */
const STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
function plainAstar(M, g, sx, sy, tx, ty, blocked) {
  const { walkable, tileKey } = M.grid;
  const T = M.tuning.HUNT_TUNING;
  if (sx === tx && sy === ty) return [];
  if (!walkable(g, tx, ty) || (blocked && blocked(tx, ty))) return null;
  const D = T.stepCost.diagonal; const S = T.stepCost.straight;
  const hOf = (x, y) => { const dx = Math.abs(x - tx); const dy = Math.abs(y - ty); return S * Math.max(dx, dy) + (D - S) * Math.min(dx, dy); };
  const gCost = new Map([[tileKey(g, sx, sy), 0]]); const from = new Map(); const closed = new Set();
  const start = tileKey(g, sx, sy);
  const open = [[hOf(sx, sy), hOf(sx, sy), 0, sx, sy]];
  let seq = 1; let expanded = 0;
  while (open.length && expanded < T.pathNodeCap) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      const a = open[i]; const b = open[bi];
      if (a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])))) bi = i;
    }
    const [, , , x, y] = open[bi];
    open[bi] = open[open.length - 1]; open.pop();
    const k = tileKey(g, x, y);
    if (closed.has(k)) continue;
    closed.add(k); expanded++;
    if (x === tx && y === ty) {
      const path = []; let c = k;
      while (c !== start) { path.push([c % g.w, (c - (c % g.w)) / g.w]); c = from.get(c); }
      return path.reverse();
    }
    for (const [dx, dy] of STEPS) {
      const nx = x + dx; const ny = y + dy;
      if (!walkable(g, nx, ny) || (dx && dy && (!walkable(g, x + dx, y) || !walkable(g, x, y + dy))) || (blocked && blocked(nx, ny))) continue;
      const nk = tileKey(g, nx, ny);
      if (closed.has(nk)) continue;
      const ng = gCost.get(k) + (dx && dy ? D : S);
      if (!gCost.has(nk) || ng < gCost.get(nk)) { gCost.set(nk, ng); from.set(nk, k); const hh = hOf(nx, ny); open.push([ng + hh, hh, seq++, nx, ny]); }
    }
  }
  return null;
}
/* How many tiles the start's side of the ground holds (the moves A* makes): a sealed search past this many expansions asks the proof. */
function reachOf(M, g, sx, sy, blocked) {
  const seen = new Set([sx + ',' + sy]); const q = [[sx, sy]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of STEPS) {
      const nx = x + dx; const ny = y + dy;
      if (!M.grid.walkable(g, nx, ny) || (dx && dy && (!M.grid.walkable(g, x + dx, y) || !M.grid.walkable(g, x, y + dy))) || blocked(nx, ny) || seen.has(nx + ',' + ny)) continue;
      seen.add(nx + ',' + ny); q.push([nx, ny]);
    }
  }
  return seen.size;
}

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
  /* A* IS THE PLAIN SEARCH (lane/r-engine-profile): its heap and its goal-side proof (sealedOff) answer what the search
     before them answered, path for path and null for null, on 400 seeded grids with walls, blockers and goals sealed in
     pockets of every size, the sealed ones searched long enough (past SEAL_AFTER) for the proof to be asked. */
  'astar-is-the-plain-search': (M) => {
    let s = 20261111;
    const rnd = (n) => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s % n; };
    let sealedLong = 0, foundLong = 0;
    for (let c = 0; c < 400; c++) {
      const w = 12 + rnd(34), h = 10 + rnd(24), wall = 10 + rnd(25);
      const rows = Array.from({ length: h }, () => Array.from({ length: w }, () => (rnd(100) < wall ? '#' : '.')).join(''));
      const g = small(M, rows);
      const pick = () => { for (let i = 0; i < 500; i++) { const x = rnd(w), y = rnd(h); if (M.grid.walkable(g, x, y)) return [x, y]; } return [0, 0]; };
      const [sx, sy] = pick(), [tx, ty] = pick();
      /* a blocker on some tiles, and in two cases of three a ring of them round the goal (radius 1 to 3, sometimes with a gap) */
      const bl = new Set();
      for (let i = rnd(w * h / 8); i > 0; i--) bl.add(rnd(w) + ',' + rnd(h));
      if (rnd(3)) {
        const r = 1 + rnd(3), gap = rnd(4) === 0;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && !(gap && dx === r && dy === 0)) bl.add((tx + dx) + ',' + (ty + dy));
      }
      bl.delete(tx + ',' + ty);
      const blocked = (x, y) => bl.has(x + ',' + y);
      const got = M.grid.astar(g, sx, sy, tx, ty, blocked);
      const want = plainAstar(M, g, sx, sy, tx, ty, blocked);
      if (JSON.stringify(got) !== JSON.stringify(want)) return 'grid ' + c + ' (' + w + 'x' + h + ', ' + sx + ',' + sy + ' -> ' + tx + ',' + ty + '): A* answered ' + JSON.stringify(got) + ', the plain search ' + JSON.stringify(want);
      const side = reachOf(M, g, sx, sy, blocked);
      if (want === null && side > 64) sealedLong++;
      if (want !== null && want.length > 12) foundLong++;
    }
    return sealedLong >= 40 && foundLong >= 40 ? null : 'the seeded grids are too easy: ' + sealedLong + ' long sealed searches, ' + foundLong + ' long paths';
  },
  /* bfsTo: the NEAREST goal tile it can walk to (no corner cut, a blocker vetoed); [] on a goal; null when sealed. */
  'bfs-nearest-goal': (M) => {
    const g = small(M, ['.#...', '.....']);
    const p = M.grid.bfsTo(g, 0, 0, (x, y) => x === 2 && y === 0, null);
    if (JSON.stringify(p) !== '[[0,1],[1,1],[2,1],[2,0]]') return 'past the wall on (1,0) the walk to (2,0) went ' + JSON.stringify(p);
    const two = M.grid.bfsTo(g, 0, 1, (x, y) => (x === 4 && y === 1) || (x === 2 && y === 1), null);
    if (JSON.stringify(two) !== '[[1,1],[2,1]]') return 'of two goals the nearer was not taken: ' + JSON.stringify(two);
    if (M.grid.bfsTo(g, 0, 1, (x, y) => x === 4 && y === 1, (x, y) => x === 1 && y === 1) !== null) return 'a blocker sealing the way must answer null';
    return JSON.stringify(M.grid.bfsTo(g, 0, 0, (x, y) => x === 0 && y === 0, null)) === '[]' ? null : 'standing on a goal must answer []';
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
    edits: [['src/core/hunt/grid.js', '      if (dx && dy && (!walkable(g, x + dx, y) || !walkable(g, x, y + dy))) continue;\n      if (blocked && blocked(nx, ny)) continue;\n', '      if (blocked && blocked(nx, ny)) continue;\n']] },
  { name: 'the breadth-first walk cuts corners', case: 'bfs-nearest-goal',
    edits: [['src/core/hunt/grid.js', '      if (dx && dy && (!walkable(g, x + dx, y) || !walkable(g, x, y + dy))) continue;\n      const nk = tileKey(g, nx, ny);\n      if (from.has(nk)', '      const nk = tileKey(g, nx, ny);\n      if (from.has(nk)']] },
  { name: 'the breadth-first walk ignores a blocker', case: 'bfs-nearest-goal',
    edits: [['src/core/hunt/grid.js', '      if (from.has(nk) || (blocked && blocked(nx, ny))) continue;', '      if (from.has(nk)) continue;']] },
  { name: 'the heap breaks a tie by the newest entry', case: 'astar-is-the-plain-search',
    edits: [['src/core/hunt/grid.js', '(a[1] === b[1] && a[2] < b[2])', '(a[1] === b[1] && a[2] > b[2])']] },
  { name: 'the goal-side proof takes "too big to tell" for "sealed off"', case: 'astar-is-the-plain-search',
    edits: [['src/core/hunt/grid.js', '      if (seen.size >= budget) return false;', '      if (seen.size >= budget) return true;']] },
  /* (a proof that floods MORE than A* walks, cutting a corner or ignoring a blocker, only proves less: safe and slower; one that
     floods LESS proves a reachable goal sealed) */
  { name: 'the goal-side proof floods only the straight moves', case: 'astar-is-the-plain-search',
    edits: [['src/core/hunt/grid.js', '    for (const [dx, dy] of NEIGHBOURS) {\n      const nx = x + dx; const ny = y + dy;\n      if (dx && dy && (!walkable(g, x + dx, y) || !walkable(g, x, y + dy))) continue;\n      if (nx === sx && ny === sy) return false;\n',
      '    for (const [dx, dy] of NEIGHBOURS.slice(0, 4)) {\n      const nx = x + dx; const ny = y + dy;\n      if (dx && dy && (!walkable(g, x + dx, y) || !walkable(g, x, y + dy))) continue;\n      if (nx === sx && ny === sy) return false;\n']] },
  { name: 'line of sight ignores walls', case: 'los-blocked-by-wall',
    edits: [['src/core/hunt/grid.js', '&& isOpaque(g, x, y)) return false;', '&& false) return false;']] },
];

await suite('hunt-core/grid', cases, mutants);
