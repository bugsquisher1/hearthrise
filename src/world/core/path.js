// ════════════════════════════════════════════════════════════════════════
// src/world/core/path.js — 8-DIRECTION A* WITH NO CORNER CUTTING.
//
// A diagonal step is allowed only when BOTH orthogonal neighbours it passes
// between are open, so a path never squeezes through the corner where two
// walls touch. The server's walk check (hr_world_walk) applies the same rule;
// this is the client half that plans a tap-to-walk. Costs are integers
// (10 straight, 14 diagonal) and ties break on insertion order, so the same
// mask and endpoints always give the same path.
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════

const DIRS = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]];

/** Is (x, y) inside the mask and open? */
export function walkable(mask, w, h, x, y) {
  return x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 0;
}

/** May a unit step from (x, y) by (dx, dy)? Diagonals need both orthogonal neighbours open. */
function canStep(mask, w, h, x, y, dx, dy) {
  if (!walkable(mask, w, h, x + dx, y + dy)) return false;
  if (dx && dy) return walkable(mask, w, h, x + dx, y) && walkable(mask, w, h, x, y + dy);
  return true;
}

function heuristic(ax, ay, bx, by) {
  const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
  return 10 * Math.max(dx, dy) + 4 * Math.min(dx, dy);
}

/**
 * The cheapest path from `from` to `to` ([x, y] tiles), both ends included, or null.
 * @param {{maxNodes?: number}} [opts] expansion budget (default: every tile once)
 */
export function findPath(mask, w, h, from, to, opts = {}) {
  const [sx, sy] = from, [tx, ty] = to;
  if (!walkable(mask, w, h, sx, sy) || !walkable(mask, w, h, tx, ty)) return null;
  const n = w * h, start = sy * w + sx, goal = ty * w + tx;
  const g = new Float64Array(n).fill(Infinity), came = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
  const heap = [];   // [f, order, idx]
  let order = 0;
  const push = (f, idx) => {
    heap.push([f, order++, idx]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] < heap[i][0] || (heap[p][0] === heap[i][0] && heap[p][1] < heap[i][1])) break;
      [heap[p], heap[i]] = [heap[i], heap[p]]; i = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        const less = (a, b) => heap[a][0] < heap[b][0] || (heap[a][0] === heap[b][0] && heap[a][1] < heap[b][1]);
        if (l < heap.length && less(l, m)) m = l;
        if (r < heap.length && less(r, m)) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  g[start] = 0;
  push(heuristic(sx, sy, tx, ty), start);
  let budget = opts.maxNodes || n;
  while (heap.length && budget-- > 0) {
    const [, , cur] = pop();
    if (closed[cur]) continue;
    if (cur === goal) break;
    closed[cur] = 1;
    const cx = cur % w, cy = (cur - cx) / w;
    for (const [dx, dy, cost] of DIRS) {
      if (!canStep(mask, w, h, cx, cy, dx, dy)) continue;
      const nb = (cy + dy) * w + (cx + dx);
      const ng = g[cur] + cost;
      if (ng < g[nb]) { g[nb] = ng; came[nb] = cur; push(ng + heuristic(cx + dx, cy + dy, tx, ty), nb); }
    }
  }
  if (g[goal] === Infinity) return null;
  const out = [];
  for (let at = goal; at !== -1; at = came[at]) out.push([at % w, Math.floor(at / w)]);
  return out.reverse();
}
