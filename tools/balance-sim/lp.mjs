// tools/balance-sim/lp.mjs — a small dense two-phase simplex (Bland's rule), for the Level curve's minimax fit.
//
// minimise c.x subject to A x <= b and x >= 0. Answers { x, value }, or null when the problem is infeasible or
// unbounded. Sized for tens of variables and constraints (the pace fit has about a dozen of each); not a general
// solver. Pure: no I/O.

export function simplex(c, A, b) {
  const m = A.length, n = c.length;
  const neg = b.map((v) => v < 0);
  const k = neg.filter(Boolean).length;
  const W = n + m + k + 1;
  const T = [];
  const basis = [];
  let ai = 0;
  for (let i = 0; i < m; i++) {
    const row = new Array(W).fill(0);
    const s = neg[i] ? -1 : 1;
    for (let j = 0; j < n; j++) row[j] = s * A[i][j];
    row[n + i] = s;
    row[W - 1] = s * b[i];
    if (neg[i]) { row[n + m + ai] = 1; basis.push(n + m + ai); ai++; } else basis.push(n + i);
    T.push(row);
  }
  const pivot = (r, col) => {
    const p = T[r][col];
    for (let j = 0; j < W; j++) T[r][j] /= p;
    for (let i = 0; i < m; i++) {
      if (i === r || T[i][col] === 0) continue;
      const f = T[i][col];
      for (let j = 0; j < W; j++) T[i][j] -= f * T[r][j];
    }
    basis[r] = col;
  };
  const run = (obj, allowed) => {
    for (let it = 0; it < 20000; it++) {
      let enter = -1;
      for (let j = 0; j < W - 1 && enter < 0; j++) {
        if (!allowed(j) || basis.includes(j)) continue;
        let rc = obj[j];
        for (let i = 0; i < m; i++) rc -= obj[basis[i]] * T[i][j];
        if (rc < -1e-12) enter = j;
      }
      if (enter < 0) return true;
      let leave = -1, best = Infinity;
      for (let i = 0; i < m; i++) {
        if (T[i][enter] <= 1e-12) continue;
        const q = T[i][W - 1] / T[i][enter];
        if (q < best - 1e-15 || (Math.abs(q - best) <= 1e-15 && basis[i] < basis[leave])) { best = q; leave = i; }
      }
      if (leave < 0) return false;
      pivot(leave, enter);
    }
    return false;
  };
  if (k) {
    const o1 = new Array(W - 1).fill(0);
    for (let j = n + m; j < n + m + k; j++) o1[j] = 1;
    run(o1, () => true);
    let art = 0;
    for (let i = 0; i < m; i++) if (basis[i] >= n + m) art += T[i][W - 1];
    if (art > 1e-9) return null;
    for (let i = 0; i < m; i++) {
      if (basis[i] < n + m) continue;
      const j = T[i].findIndex((v, jj) => jj < n + m && Math.abs(v) > 1e-12);
      if (j >= 0) pivot(i, j);
    }
  }
  const o2 = new Array(W - 1).fill(0);
  for (let j = 0; j < n; j++) o2[j] = c[j];
  if (!run(o2, (j) => j < n + m)) return null;
  const x = new Array(n).fill(0);
  for (let i = 0; i < m; i++) if (basis[i] < n) x[basis[i]] = T[i][W - 1];
  return { x, value: x.reduce((s, v, j) => s + v * c[j], 0) };
}
