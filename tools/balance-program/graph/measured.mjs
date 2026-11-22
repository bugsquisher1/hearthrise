// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/graph/measured.mjs — MEASURED MOVEMENT, IN ONE SHAPE, AND THE COMPARE AGAINST WHAT WAS DECLARED AND PREDICTED
// (Balance Lab phase 1; docs/design/redesign/07-balance-lab.md section 3.5 item 1 "declared against measured"). Pure. Plays nothing.
//
//   fromSweeps(docs, run)      -> the measured table from the balance-sweeps artifacts (one doc a knob, or the joined balance-sweeps.json)
//   fromSensitivity(matrix)    -> the same table from the sensitivity lane's data/matrix.json (hearthrise.balance-sensitivity-matrix/1)
//   verdictOf(moved, up)       -> 'up' | 'down' | 'unresolved' | 'flat'
//   compare(units, measured)   -> every (unit, outcome) row with what was declared, predicted and measured, the findings, the sign-match rate
//
// THE MEASURED TABLE: { schema, source, rule, units: { id: { kind, steps, cells, outcomes: { id: { n, moved, up, size, verdict } },
// bands: { band id: rows moved }, where: { tier, party, block } } } }. A unit is whatever was moved: a knob today, a lever family when
// the sensitivity matrix lands.
//
// THE RULE FOR THE SWEEPS (two seeds, one hour a cell, no per-seed rows kept, so no standard error can be read):
//   A cell MOVED when the outcome at the highest step differs from the lowest by 2% or more of the largest of the three values.
//   An outcome is UP or DOWN when at least 8 cells moved, 70% or more of them one way, and that majority is 3 or more standard
//   deviations from an even split (a sign test). FLAT when fewer than 8 cells moved. Anything else is UNRESOLVED: it moved, with no
//   direction this data can state. The sensitivity matrix carries real standard errors, so there the verdict is its own `resolved`.
// ════════════════════════════════════════════════════════════════════════

export const MEASURED_SCHEMA = 'hearthrise.balance-graph-measured/1';
export const RULE = Object.freeze({ cellMoved: 0.02, minCells: 8, majority: 0.7, z: 3 });

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const sig = (x, n = 3) => (typeof x === 'number' && Number.isFinite(x) ? Number(x.toPrecision(n)) : null);

/** 'up' | 'down' | 'unresolved' | 'flat' from how many cells moved and how many of those rose. */
export function verdictOf(moved, up, rule = RULE) {
  if (moved < rule.minCells) return 'flat';
  const major = Math.max(up, moved - up);
  const z = (major - moved / 2) / Math.sqrt(moved / 4);
  if (major / moved >= rule.majority && z >= rule.z) return up * 2 > moved ? 'up' : 'down';
  return 'unresolved';
}

/** One knob of one sweep doc as a measured unit. `doc.cells` is the cell list, `doc.baseline` the base numbers, `metrics` the ids. */
function unitOfKnob(doc, k, metrics, rule) {
  const steps = Object.keys(k.steps).map(Number).filter((m) => k.steps[String(m)].cells && Object.keys(k.steps[String(m)].cells).length).sort((a, b) => a - b);
  if (steps.length < 2) return { kind: 'knob', steps, cells: 0, outcomes: {}, bands: {}, where: {}, applied: [], notPlayed: 'no cell was played at two steps' };
  const lo = k.steps[String(steps[0])], hi = k.steps[String(steps[steps.length - 1])];
  const meta = new Map((doc.cells || []).map((c) => [c.key, c]));
  const keys = Object.keys(doc.baseline).filter((key) => lo.cells[key] && hi.cells[key]);
  const outcomes = {}, movedCell = new Set();
  metrics.forEach((id, i) => {
    let n = 0, moved = 0, up = 0;
    const sizes = [];
    for (const key of keys) {
      const b = doc.baseline[key][i], l = lo.cells[key][i], h = hi.cells[key][i];
      if (typeof b !== 'number' || typeof l !== 'number' || typeof h !== 'number') continue;
      n++;
      const den = Math.max(Math.abs(b), Math.abs(l), Math.abs(h));
      const r = den === 0 ? 0 : (h - l) / den;
      if (Math.abs(r) >= rule.cellMoved) { moved++; if (r > 0) up++; sizes.push(r); movedCell.add(key); }
    }
    outcomes[id] = { n, moved, up, size: sig(median(sizes)), verdict: verdictOf(moved, up, rule) };
  });
  const bands = {};
  for (const st of [lo, hi]) for (const row of st.bands || []) { const id = row[1]; if (id) bands[id] = (bands[id] || 0) + 1; }
  const where = { tier: {}, party: {}, block: {} };
  for (const key of movedCell) {
    const c = meta.get(key);
    if (!c) continue;
    for (const [axis, v] of [['tier', c.tier], ['party', String(c.party)], ['block', c.block]]) if (v != null) where[axis][v] = (where[axis][v] || 0) + 1;
  }
  return { kind: 'knob', label: k.label, steps: [steps[0], steps[steps.length - 1]], cells: keys.length, applied: lo.applied || [], outcomes, bands, where };
}

/** The measured table from sweep docs (hearthrise.balance-sweeps/1). One doc may hold one knob or all of them. */
export function fromSweeps(docs, run = null, rule = RULE) {
  if (!docs.length) throw new Error('measured: no sweep doc');
  const first = docs[0];
  const metrics = first.metrics.map((m) => m.id);
  const units = {};
  for (const doc of docs) for (const [id, k] of Object.entries(doc.knobs || {})) units[id] = unitOfKnob(doc, k, metrics, rule);
  return {
    schema: MEASURED_SCHEMA,
    source: { kind: 'balance-sweeps', githubRun: run || first.githubRun || null, commit: first.commit, treeHash: first.treeHash, base: first.base || null, run: first.run, seeds: first.seeds, hours: first.hours,
      cells: (first.cells || []).length, at: first.at || null },
    rule: { ...rule, text: 'a cell moved at 2% between the lowest and highest step. An outcome is up or down at 8 or more moved cells, 70% one way, 3 standard deviations from an even split. Under 8 moved cells is flat' },
    units: Object.fromEntries(Object.keys(units).sort().map((id) => [id, units[id]])),
  };
}

/** The measured table from the sensitivity lane's matrix (group `all`, the lowest and highest step of each lever's ladder). */
export function fromSensitivity(matrix) {
  if (!matrix || matrix.schema !== 'hearthrise.balance-sensitivity-matrix/1') throw new Error('measured: not a sensitivity matrix (' + (matrix && matrix.schema) + ')');
  const units = {};
  for (const [id, lv] of Object.entries(matrix.oat || {})) {
    const ms = Object.keys(lv.steps).map(Number).sort((a, b) => a - b);
    if (!ms.length) continue;
    const lo = (lv.steps[ms[0]] || {}).all || {}, hi = (lv.steps[ms[ms.length - 1]] || {}).all || {};
    const outcomes = {};
    for (const o of new Set([...Object.keys(lo), ...Object.keys(hi)])) {
      /* an effect below 1 read at the low step and above 1 read at the high step agree when their signs differ */
      const a = lo[o] && lo[o].r && ms[0] < 1 ? -Math.sign(lo[o].e) : 0, b = hi[o] && hi[o].r && ms[ms.length - 1] > 1 ? Math.sign(hi[o].e) : 0;
      const verdict = a && b && a !== b ? 'unresolved' : (a || b) > 0 ? 'up' : (a || b) < 0 ? 'down' : 'flat';
      outcomes[o] = { n: null, moved: null, up: null, size: sig(hi[o] ? hi[o].e : lo[o] ? -lo[o].e : null), verdict };
    }
    units[id] = { kind: lv.kind || 'knob', label: lv.label, steps: [ms[0], ms[ms.length - 1]], cells: (matrix.cells || []).length, applied: [], outcomes, bands: {}, where: {}, intends: lv.intends || [] };
  }
  return { schema: MEASURED_SCHEMA, source: { kind: 'sensitivity-matrix', githubRun: (matrix.githubRuns || []).join(',') || null, commit: Object.keys(matrix.commits || {}).join(',') || null, scenarioHash: matrix.scenarioHash, seeds: matrix.seedSets, cells: (matrix.cells || []).length },
    rule: { text: 'the sensitivity lane\'s own rule: an effect is resolved beyond Student\'s t times its standard error over the seeds, and beyond half a percent' },
    units: Object.fromEntries(Object.keys(units).sort().map((id) => [id, units[id]])) };
}

/**
 * Declared against measured, and predicted against measured.
 * `units`: [{ id, levers: [lever ids], declared: [outcome ids], predicted: Map(outcome -> { sign, depth, counter }) }].
 * Answers { rows, findings, match: { hit, miss, noCall, measuredSigned, rate, coverage }, notMeasured: [unit ids] }.
 */
export function compare(units, measured, outcomeIds) {
  const rows = [], findings = [], notMeasured = [];
  let hit = 0, miss = 0, noCall = 0, signed = 0;
  for (const u of units) {
    const m = measured && measured.units[u.id];
    if (!m || !m.cells || !Object.keys(m.outcomes).length) { notMeasured.push(u.id); continue; }
    const declared = new Set(u.declared);
    const anyMoved = outcomeIds.some((o) => m.outcomes[o] && m.outcomes[o].verdict !== 'flat');
    if (!anyMoved) {
      findings.push({ kind: 'dead', key: u.id, what: u.id + ' moved no measured outcome between x' + m.steps[0] + ' and x' + m.steps[1] + ' on ' + m.cells + ' cells. It declares ' + (u.declared.join(', ') || 'nothing') + '. The levers behind it: ' + u.levers.join(', ') });
    }
    for (const o of outcomeIds) {
      const mo = m.outcomes[o];
      if (!mo) continue;
      const p = u.predicted.get(o) || null;
      const pred = !p ? 'none' : p.sign === 1 ? 'up' : p.sign === -1 ? 'down' : p.sign === 'mixed' ? 'mixed' : 'unknown';
      const row = { unit: u.id, outcome: o, declared: declared.has(o), predicted: pred, depth: p ? p.depth : null, measured: mo.verdict, moved: mo.moved, up: mo.up, n: mo.n, size: mo.size, match: null };
      if (mo.verdict === 'up' || mo.verdict === 'down') {
        signed++;
        if (pred === 'up' || pred === 'down') {
          row.match = pred === mo.verdict;
          if (row.match) hit++; else {
            miss++;
            findings.push({ kind: 'sign', key: u.id + '|' + o, what: u.id + ' on ' + o + ': the trace predicts ' + pred + ' (depth ' + p.depth + ', via ' + p.path.filter((x) => x.via).map((x) => x.via).join(' > ') + '), measured ' + mo.verdict + ' (' + mo.moved + ' cells moved, ' + mo.up + ' up)' });
          }
        } else noCall++;
        if (!declared.has(o)) findings.push({ kind: 'undeclared-move', key: u.id + '|' + o, what: u.id + ' moved ' + o + ' ' + mo.verdict + ' (' + mo.moved + ' of ' + mo.n + ' cells, median ' + (mo.size === null ? '?' : (mo.size * 100).toFixed(1) + '%') + ') and no lever behind it declares that outcome' });
      } else if (anyMoved && mo.verdict === 'flat' && declared.has(o)) {
        findings.push({ kind: 'dead-outcome', key: u.id + '|' + o, what: u.id + ' declares ' + o + ' and it did not move (' + mo.moved + ' of ' + mo.n + ' cells past 2%)' });
      }
      rows.push(row);
    }
  }
  const called = hit + miss;
  return { rows, findings, notMeasured, match: { hit, miss, noCall, measuredSigned: signed, rate: called ? hit / called : null, coverage: signed ? called / signed : null } };
}
