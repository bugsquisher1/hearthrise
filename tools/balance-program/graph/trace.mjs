// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/graph/trace.mjs — THE TRACE WITH POLARITY (Balance Lab phase 1; docs/design/redesign/07-balance-lab.md
// section 3.1 "second-order trace"). Pure functions on the typed rows. Plays nothing.
//
//   stepsOf(mechanics)            -> the quantity-to-quantity steps: one for every read of a mechanic and every write that read reaches
//   trace(steps, starts, depth)   -> what a set of moved quantities reaches: Map(quantity -> { depth, sign, via, path, counter })
//   signWord(sign)                -> 'up' | 'down' | 'mixed' | 'unknown'
//
// HOW A DIRECTION IS PREDICTED. A mechanic that reads q with '+' passes q's direction on to what it writes. '-' flips it. '~' makes
// it unknown. An offline read ('!') passes nothing: the table is not re-read when q moves. A career read ('@') passes nothing inside one
// hunt. A quantity's DEPTH is the fewest mechanics
// between the lever and it. Its predicted direction is the direction of its SHORTEST paths. If two shortest paths disagree the
// answer is MIXED and the graph does not call it. A longer path that disagrees with the shortest is kept as `counter`: it is the
// second-order effect that may win, and it is printed, never hidden.
// This is a first-order reading of a graph, not a simulation: it knows directions, not sizes. The measured sweeps judge it.
// ════════════════════════════════════════════════════════════════════════

export const MAX_DEPTH = 9;

/** The steps of a list of mechanics [{ id, reads: [{ q, sign, offline, career, to }], writes: [{ q }] }]. `o.career` keeps the reads that act
    between hunts (earned XP becoming a Level): the default is one hunt, where they pass nothing on. */
export function stepsOf(mechanics, o = {}) {
  const out = [];
  for (const m of mechanics) {
    for (const r of m.reads) {
      if (r.offline || (r.career && !o.career)) continue;
      for (const w of m.writes) {
        if (w.q === r.q) continue;
        if (r.to && !r.to.includes(w.q)) continue;
        out.push({ from: r.q, to: w.q, sign: r.sign, via: m.id });
      }
    }
  }
  return out;
}

/**
 * Breadth-first over (quantity, direction). `starts` is [{ q, sign }] with sign 1, -1 or 0 (unknown).
 * Answers Map(q -> { depth, sign: 1 | -1 | 0 | 'mixed', via, path: [{ q, via }], counter: { depth, sign } | null }).
 */
export function trace(steps, starts, maxDepth = MAX_DEPTH) {
  const byFrom = new Map();
  for (const s of steps) { if (!byFrom.has(s.from)) byFrom.set(s.from, []); byFrom.get(s.from).push(s); }
  const seen = new Map(); // 'q|sign' -> { depth, parent, via }
  let frontier = [];
  for (const s of starts) { const k = s.q + '|' + s.sign; if (!seen.has(k)) { seen.set(k, { q: s.q, sign: s.sign, depth: 0, parent: null, via: null }); frontier.push(k); } }
  for (let d = 1; d <= maxDepth && frontier.length; d++) {
    const next = [];
    for (const k of frontier) {
      const cur = seen.get(k);
      for (const st of byFrom.get(cur.q) || []) {
        const sign = cur.sign === 0 || st.sign === 0 ? 0 : cur.sign * st.sign;
        const nk = st.to + '|' + sign;
        if (seen.has(nk)) continue;
        seen.set(nk, { q: st.to, sign, depth: d, parent: k, via: st.via });
        next.push(nk);
      }
    }
    frontier = next;
  }
  const out = new Map();
  const pathOf = (k) => { const p = []; for (let x = seen.get(k); x; x = x.parent ? seen.get(x.parent) : null) p.unshift({ q: x.q, via: x.via }); return p; };
  const byQ = new Map();
  for (const [k, v] of seen) { if (!byQ.has(v.q)) byQ.set(v.q, []); byQ.get(v.q).push([k, v]); }
  for (const [qid, list] of byQ) {
    const depth = Math.min(...list.map(([, v]) => v.depth));
    const first = list.filter(([, v]) => v.depth === depth);
    const signs = [...new Set(first.map(([, v]) => v.sign))];
    const sign = signs.length === 1 ? signs[0] : 'mixed';
    const later = list.filter(([, v]) => v.depth > depth && v.sign !== sign && v.sign !== 0).sort((a, b) => a[1].depth - b[1].depth)[0];
    out.set(qid, { depth, sign, via: first[0][1].via, path: pathOf(first[0][0]), paths: first.map(([k]) => pathOf(k)),
      counter: later && sign !== 'mixed' ? { depth: later[1].depth, sign: later[1].sign, path: pathOf(later[0]) } : null });
  }
  return out;
}

export const signWord = (s) => (s === 1 ? 'up' : s === -1 ? 'down' : s === 'mixed' ? 'mixed' : 'unknown');
/** A direction turned over (a lever moved down). */
export const flip = (s) => (s === 1 ? -1 : s === -1 ? 1 : s);
