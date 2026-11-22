#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/lab.mjs — THE BALANCE LAB'S FRONT DOOR: ask before you change (Balance Lab phase 1; docs/design/redesign/
// 07-balance-lab.md section 3.8, the verbs `ask` and `propose`). It adds no logic of its own: every line it prints is read from the
// model graph (tools/balance-program/graph.mjs), the lever registry, the targets and the measured table.
//
//   node tools/balance-program/lab.mjs ask <lever | knob | formula | quantity | outcome | target>
//        The affected picture on one screen: where it lives, what it moves, the typed reads and writes with their file:line, what it
//        reaches at depths 1 to 3 and in which direction, every measured outcome (predicted, measured, declared), the targets touched,
//        the ghost edges and other findings on it, and the tests that verify it. --full prints every row a screen would cut.
//   node tools/balance-program/lab.mjs propose <change> [<change> ...]
//        Everything a change touches, before it is played. A change is `knob=1.1`, `lever=up`, `lever=down`, or a patch file
//        (hearthrise.balance-patch/1: its knobs and its targets are read). Prints what moves, the predicted direction of every
//        outcome with each change's share in it, the size the measured sweeps suggest (a PREDICTION, linear between the played steps),
//        what the change did not declare, the targets touched, the findings on its path, and what must be re-run.
//   --json   the same answer as data.       --selftest   the proofs.
//
// A name that matches nothing prints the nearest names and exits 2. It reads the tree as it stands, so it is never staler than the code.
//
// Exit: 0 answered · 1 a --selftest proof failed · 2 a name that matches nothing, or a bad argument.
// mutant-anchors: none — --selftest asks the planted graph of graph.mjs plantedCtx, in memory; no tracked file is patched
// ci-step: economy-selftests | Balance Lab ask and propose - the picture of a planted lever, an undeclared outcome of a proposal and an unknown name are each read right
// ci-run: node tools/mutant-gate.mjs node tools/balance-program/lab.mjs --selftest
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../tests/_is-main.mjs';
import { buildGraph, outcomesOfBand } from './graph/build.mjs';
import { trace, stepsOf, signWord, flip } from './graph/trace.mjs';
import { treeCtx, plantedCtx } from './graph.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const WIDTH = 150;
const arrow = (s) => (s === 1 ? 'up' : s === -1 ? 'down' : s === 'mixed' ? 'mixed' : s === 0 ? 'moves' : 'none');
const pct = (x) => (x === null || x === undefined ? '' : (x > 0 ? '+' : '') + (x * 100).toFixed(1) + '%');
const short = (f) => f.replace(/^src\//, '').replace(/^tools\/balance-program\//, '');
const wrap = (head, items, indent = 12, width = WIDTH) => {
  const out = [];
  let line = head.padEnd(indent);
  const fresh = () => line.length <= indent && !line.slice(indent).length;
  for (const it of items) {
    if (it.length > width - indent) {
      /* one item longer than a line: break it at its words */
      if (!fresh()) line += ' · ';
      for (const w of it.split(' ')) { if (line.length + w.length + 1 > width && !fresh()) { out.push(line.replace(/\s+$/, '')); line = ' '.repeat(indent); } line += (fresh() || line.endsWith(' ') ? '' : ' ') + w; }
      continue;
    }
    if (line.length + it.length + 3 > width && !fresh()) { out.push(line.replace(/\s+$/, '')); line = ' '.repeat(indent); }
    line += (fresh() ? '' : ' · ') + it;
  }
  if (line.trim().length) out.push(line.replace(/\s+$/, ''));
  return out;
};
const cut = (list, n, full) => (full || list.length <= n ? list : [...list.slice(0, n), '+' + (list.length - n) + ' more (--full)']);

/** The lab on one built graph. `ctx` is what buildGraph read (its levers carry the sites and tests). */
export function labOf(ctx) {
  const built = buildGraph(ctx);
  const g = built.graph;
  const mech = built.mech;
  const steps = built.steps, careerSteps = stepsOf([...mech.values()], { career: true });
  const outcomeIds = g.quantities.filter((q) => q.kind === 'outcome').map((q) => q.id);
  const rawLever = new Map(ctx.levers.map((L) => [L.id, L]));
  const lever = new Map(g.levers.map((L) => [L.id, L])), knob = new Map(g.knobs.map((k) => [k.id, k])), formula = new Map(g.formulas.map((F) => [F.id, F]));
  const reader = new Map(g.readers.map((r) => [r.id, r])), quantity = new Map(g.quantities.map((q) => [q.id, q])), target = new Map(g.targets.map((t) => [t.id, t]));
  const alias = new Map();
  for (const F of ctx.arch.formulas) for (const a of F.also || []) if (a) alias.set(a, F.id);
  const measuredUnit = (id) => (ctx.measured && ctx.measured.units[id] && ctx.measured.units[id].cells ? ctx.measured.units[id] : null);
  const rowsOf = (unit) => (g.measured ? g.measured.rows.filter((r) => r.unit === unit) : []);
  const findingsOn = (ids) => g.findings.filter((f) => ids.some((id) => [f.a, f.b].some((x) => x && String(x).split('+').includes(id))));
  const targetsOf = (outs) => g.targets.filter((t) => t.outcomes.some((o) => outs.includes(o)));

  /** What a name is: { kind, id } or { kind: 'none', near: [...] }. */
  function resolveName(name) {
    const n = String(name);
    for (const [kind, map] of [['lever', lever], ['knob', knob], ['formula', formula], ['reader', reader], ['target', target], ['quantity', quantity]]) if (map.has(n)) return { kind: kind === 'quantity' && quantity.get(n).kind === 'outcome' ? 'outcome' : kind, id: n };
    if (alias.has(n)) return { kind: 'formula', id: alias.get(n) };
    const low = n.toLowerCase();
    const pool = [...[...lever.values()].map((L) => ['lever', L.id, L.id + ' ' + L.name]), ...[...knob.keys()].map((k) => ['knob', k, k]), ...[...formula.keys()].map((k) => ['formula', k, k]),
      ...[...target.keys()].map((k) => ['target', k, k]), ...[...quantity.values()].map((q) => [q.kind === 'outcome' ? 'outcome' : 'quantity', q.id, q.id + ' ' + q.label])];
    const exact = pool.filter(([, id]) => id.toLowerCase() === low);
    if (exact.length === 1) return { kind: exact[0][0], id: exact[0][1] };
    const near = pool.filter(([, , text]) => text.toLowerCase().includes(low));
    if (near.length === 1) return { kind: near[0][0], id: near[0][1] };
    return { kind: 'none', near: near.slice(0, 12).map(([kind, id]) => kind + ' ' + id) };
  }

  const reachOf = (starts, st = steps) => trace(st, starts);
  const reachLines = (t, full) => {
    const lines = [];
    for (const d of [1, 2, 3]) {
      const at = [...t.entries()].filter(([, v]) => v.depth === d).map(([q, v]) => q + ' ' + arrow(v.sign) + ' (' + v.via + ')' + (v.counter ? ' [a depth ' + v.counter.depth + ' path says ' + arrow(v.counter.sign) + ']' : ''));
      if (at.length) lines.push(...wrap('  depth ' + d, cut(at, 9, full)));
    }
    const deeper = [...t.values()].filter((v) => v.depth > 3).length;
    if (deeper) lines.push('  beyond     ' + deeper + ' more quantities past depth 3 (the outcomes below are read at any depth)');
    return lines;
  };
  const ioLines = (ids, full) => ids.flatMap((id) => {
    const m = formula.get(id) || reader.get(id);
    if (!m) return [];
    const rd = (m.reads || []).map((r) => (r.career ? '@' : '') + (r.offline ? '!' : r.sign === 1 ? '+' : r.sign === -1 ? '-' : '~') + r.q + (r.to ? '>' + r.to.join(',') : '') + (r.at && r.at.length ? ' (' + short(r.at[0]) + ')' : ' (declared)'));
    const wr = (m.writes || []).map((w) => (typeof w === 'string' ? w : w.q + (w.at && w.at.length ? ' (' + short(w.at[0]) + ')' : ' (declared)')));
    const lead = (word, list) => (list.length ? [word + ' ' + list[0], ...list.slice(1)] : [word + ' nothing']);
    return [...wrap('  ' + id, lead('reads', cut(rd, 10, full)), 16), ...wrap('', lead('writes', cut(wr, 10, full)), 16)];
  });
  const outcomeTable = (t, unitIds, declared, dir = 1) => {
    const lines = ['  ' + 'outcome'.padEnd(17) + 'predicted'.padEnd(26) + 'measured'.padEnd(46) + 'declared'];
    for (const o of outcomeIds) {
      const p = t.get(o);
      const ms = unitIds.map((u) => { const r = rowsOf(u).find((x) => x.outcome === o); return r ? r.measured + (r.size !== null && r.measured !== 'flat' ? ' ' + pct(r.size) : '') + ' (' + r.moved + '/' + r.n + ' cells' + (unitIds.length > 1 ? ', ' + u : '') + ')' : null; }).filter(Boolean);
      if (!p && !ms.some((m) => !m.startsWith('flat')) && !declared.includes(o)) continue;
      const pred = p ? arrow(dir === 1 ? p.sign : flip(p.sign)) + ' d' + p.depth + (p.counter ? ' (d' + p.counter.depth + ' says ' + arrow(dir === 1 ? p.counter.sign : flip(p.counter.sign)) + ')' : '') : 'not reached';
      lines.push('  ' + o.padEnd(17) + pred.padEnd(26) + (ms.join('; ') || 'not measured').padEnd(46) + (declared.includes(o) ? 'declared' : '-'));
    }
    return lines;
  };

  /** ask: { lines, data }. */
  function ask(name, o = {}) {
    const r = resolveName(name);
    if (r.kind === 'none') return { exit: 2, lines: ['lab ask: nothing is named ' + name + (r.near.length ? '. Nearest: ' + r.near.join(', ') : '')], data: { error: 'unknown', near: r.near } };
    const full = !!o.full, lines = [], data = { kind: r.kind, id: r.id };
    const findingBlock = (ids) => {
      const fs = findingsOn(ids);
      data.findings = fs.map((f) => ({ id: f.id, kind: f.kind, what: f.what }));
      if (!fs.length) return ['FINDINGS    none on it'];
      const by = {};
      for (const f of fs) by[f.kind] = (by[f.kind] || 0) + 1;
      return ['FINDINGS    ' + fs.length + ' on it: ' + Object.entries(by).map(([k, n]) => k + ' ' + n).join(', '), ...cut(fs.map((f) => '  ' + f.id + ' [' + f.kind + '] ' + (f.what.length > WIDTH - 26 ? f.what.slice(0, WIDTH - 29) + '...' : f.what)), 5, full)];
    };
    const targetBlock = (outs, bandsMoved) => {
      const ts = targetsOf(outs);
      data.targets = ts.map((t) => t.id);
      const lines2 = wrap('TARGETS', ts.length ? cut(ts.map((t) => t.id + ' (' + t.outcomes.filter((x) => outs.includes(x)).join(',') + ')'), 16, full) : ['none of the 100 targets reads an outcome it reaches']);
      if (bandsMoved && Object.keys(bandsMoved).length) lines2.push(...wrap('  measured', cut(Object.entries(bandsMoved).sort((a, b) => b[1] - a[1]).map(([b, n]) => b + ' x' + n), 14, full).map((x, i) => (i === 0 ? 'bands that moved in the sweep: ' + x : x))));
      return lines2;
    };
    if (r.kind === 'lever' || r.kind === 'knob') {
      const ls = r.kind === 'lever' ? [lever.get(r.id)] : knob.get(r.id).levers.map((id) => lever.get(id));
      const k = r.kind === 'knob' ? knob.get(r.id) : null;
      const moves = k ? k.moves : ls[0].moves;
      const units = k ? [k.id] : ls[0].knobs.filter((x) => knob.has(x));
      const t = reachOf(moves.map((m) => ({ q: m.q, sign: m.sign })));
      const declared = [...new Set(ls.flatMap((L) => L.outcomes))];
      const formulas = [...new Set([...(k && k.formula ? [k.formula] : []), ...ls.flatMap((L) => L.formulas)])];
      lines.push((k ? 'KNOB ' + k.id : 'LEVER ' + ls[0].id + '  ' + ls[0].name) + (k ? '  (levers: ' + (k.levers.join(', ') || 'none') + ')' : '  [' + ls[0].category + ', ' + ls[0].class + ']' + (ls[0].knobs.length ? '  knob ' + ls[0].knobs.join(', ') : '  ' + ls[0].perturb)));
      for (const L of ls) lines.push(...wrap('  where', [...L.sites.map((s) => s.file + ':' + s.line + (s.binding ? ' ' + s.binding : '')), ...(k ? [L.id + ' ' + L.name] : [])]));
      lines.push(...wrap('  moves', moves.map((m) => m.q + ' ' + arrow(m.sign) + (m.why ? ' (' + m.why + ')' : '')).concat(k ? [] : ['from: ' + ls[0].movesFrom])));
      const inCode = [...new Set(ls.flatMap((L) => L.readers.map((x) => x.formulas.join('/') + ' at ' + short(x.at))))];
      lines.push(...wrap('  formulas', [formulas.join(', ') || 'none named', ...(inCode.length ? ['read in code by ' + cut(inCode, 5, full).join(', ')] : [])]));
      lines.push('READS AND WRITES of its formulas (file:line where the code shows it)', ...ioLines(formulas, full));
      lines.push('REACH when it is raised (depth is the number of mechanics on the way)', ...reachLines(t, full));
      const m = units.map(measuredUnit).filter(Boolean)[0];
      lines.push('OUTCOMES' + (m ? '    measured between x' + m.steps[0] + ' and x' + m.steps[1] + ' on ' + m.cells + ' cells' + (ctx.measured.source.githubRun ? ' (run ' + ctx.measured.source.githubRun + ')' : '') : '    no measured data for it: it waits on the sensitivity lane'));
      lines.push(...outcomeTable(t, units.filter(measuredUnit), declared));
      const rows = units.flatMap(rowsOf).filter((x) => x.match !== null);
      if (rows.length) lines.push('  sign match here: ' + rows.filter((x) => x.match).length + ' of ' + rows.length + ' called');
      lines.push(...targetBlock(outcomeIds.filter((x) => t.has(x)), m ? m.bands : null));
      lines.push(...findingBlock([...ls.map((L) => L.id), ...units, ...formulas]));
      const tests = ls.flatMap((L) => { const T = (rawLever.get(L.id) || {}).tests; return T ? [...(T.asserts || []).map((a) => a.file + ' asserts ' + a.what), ...(T.asserts && T.asserts.length ? [] : [(T.verdict || 'no test') + (T.mentionCount ? ': ' + T.mentionCount + ' file(s) mention it, none asserts it' : '')])] : ['none recorded']; });
      lines.push(...wrap('TESTS', cut([...new Set(tests)], 6, full)));
      const far = reachOf(moves.map((x) => ({ q: x.q, sign: x.sign })), careerSteps);
      const only = [...far.keys()].filter((q) => !t.has(q));
      if (only.length) lines.push(...wrap('CAREER', ['over many hunts, through earned XP becoming Levels and skill, it also reaches', ...cut(only, 8, full)]));
      Object.assign(data, { levers: ls.map((L) => L.id), moves, formulas, reach: [...t.entries()].map(([q, v]) => ({ q, depth: v.depth, sign: signWord(v.sign), via: v.via })), declared, measured: units.flatMap(rowsOf) });
    } else if (r.kind === 'formula' || r.kind === 'reader') {
      const F = formula.get(r.id) || reader.get(r.id);
      const writes = (F.writes || []).map((w) => (typeof w === 'string' ? w : w.q));
      const t = reachOf(writes.map((q) => ({ q, sign: 1 })));
      const ls = g.levers.filter((L) => L.formulas.includes(r.id));
      lines.push((r.kind === 'reader' ? 'OUTCOME READER ' : 'FORMULA ') + r.id + (F.state ? '  [' + F.state + ']' : '') + (F.homes && F.homes.length ? '  ' + F.homes.join('  ') : ''));
      lines.push(...wrap('  what', [(F.what || F.why || '').slice(0, 420)]));
      if (F.note) lines.push(...wrap('  note', [F.note]));
      lines.push('READS AND WRITES', ...ioLines([r.id], true));
      lines.push(...wrap('LEVERS', ls.length ? cut(ls.map((L) => L.id + (L.knobs.length ? ' (knob ' + L.knobs[0] + ')' : '')), 14, full) : ['no lever names it']));
      const feeders = [...new Set(g.edges.filter((e) => e.to === r.id).map((e) => e.from + ' (' + e.q + ')'))], fed = [...new Set(g.edges.filter((e) => e.from === r.id).map((e) => e.to + ' (' + e.q + ')'))];
      lines.push(...wrap('FED BY', feeders.length ? cut(feeders, 12, full) : ['nothing typed']), ...wrap('FEEDS', fed.length ? cut(fed, 12, full) : ['nothing typed']));
      lines.push('REACH when what it writes rises', ...reachLines(t, full));
      lines.push(...wrap('OUTCOMES', outcomeIds.filter((x) => t.has(x)).map((x) => x + ' ' + arrow(t.get(x).sign) + ' d' + t.get(x).depth).concat(outcomeIds.some((x) => t.has(x)) ? [] : ['none reached'])));
      lines.push(...targetBlock(outcomeIds.filter((x) => t.has(x))), ...findingBlock([r.id]));
      const tests = [...new Set(ls.flatMap((L) => (((rawLever.get(L.id) || {}).tests || {}).asserts || []).map((a) => a.file)))];
      lines.push(...wrap('TESTS', tests.length ? cut(tests, 8, full) : ['no lever on it carries an asserting test']));
      Object.assign(data, { reads: F.reads, writes, levers: ls.map((L) => L.id) });
    } else {
      /* a quantity, an outcome or a target: who writes it, who reads it, and every lever that reaches it */
      const T = r.kind === 'target' ? target.get(r.id) : null;
      const qs = T ? T.outcomes : [r.id];
      if (T) {
        const raw = ((ctx.targets && ctx.targets.targets) || []).find((x) => x.id === r.id) || {};
        lines.push('TARGET ' + T.id + '  [' + T.area + ', ' + T.readerState + ']  ' + T.metric);
        if (raw.band && raw.band.text) lines.push(...wrap('  band', [raw.band.text]));
        if (raw.scope && raw.scope.text) lines.push(...wrap('  scope', [raw.scope.text]));
        lines.push(...wrap('  readers', [T.readers.join(', '), 'outcomes in the graph: ' + (T.outcomes.join(', ') || 'NONE: the graph cannot see this target')]));
        if (T.conflicts.length) lines.push(...wrap('  tensions', T.conflicts));
      } else {
        const Qn = quantity.get(r.id);
        lines.push((Qn.kind === 'outcome' ? 'OUTCOME ' : 'QUANTITY ') + Qn.id + '  ' + Qn.label);
        lines.push(...wrap('  written by', Qn.writers.length ? Qn.writers : ['nothing: it is content data or a state no formula sets']), ...wrap('  read by', Qn.readers.length ? cut(Qn.readers, 18, full) : ['nothing']));
        const ts = targetsOf([r.id]);
        lines.push(...wrap('TARGETS', ts.length ? cut(ts.map((t) => t.id), 18, full) : ['no target reads it']));
      }
      const hits = [];
      for (const L of g.levers) {
        const t = reachOf(L.moves.map((m) => ({ q: m.q, sign: m.sign })));
        for (const qid of qs) if (t.has(qid)) {
          const row = L.knobs.flatMap(rowsOf).find((x) => x.outcome === qid) || null;
          hits.push({ lever: L.id, q: qid, depth: t.get(qid).depth, sign: t.get(qid).sign, measured: row ? row.measured : null, size: row ? row.size : null, declared: L.outcomes.includes(qid) });
        }
      }
      hits.sort((a, b) => Math.abs(b.size || 0) - Math.abs(a.size || 0) || a.depth - b.depth || (a.lever < b.lever ? -1 : 1));
      lines.push('LEVERS THAT REACH IT  ' + new Set(hits.map((h) => h.lever)).size + ' of ' + g.levers.length + ' (measured size first, then the shortest way)');
      lines.push('  ' + 'lever'.padEnd(30) + (T ? 'outcome'.padEnd(17) : '') + 'predicted'.padEnd(14) + 'measured'.padEnd(18) + 'declared');
      for (const h of cut(hits, 26, full)) lines.push(typeof h === 'string' ? '  ' + h : '  ' + h.lever.padEnd(30) + (T ? h.q.padEnd(17) : '') + (arrow(h.sign) + ' d' + h.depth).padEnd(14) + (h.measured ? h.measured + ' ' + pct(h.measured === 'flat' ? null : h.size) : 'not measured').padEnd(18) + (h.declared ? 'declared' : '-'));
      lines.push(...findingBlock(T ? [T.id, ...qs] : [r.id]));
      Object.assign(data, { quantities: qs, levers: hits });
    }
    return { exit: 0, lines, data };
  }

  /** A change as { unit, kind, dir, mult }. `x` is 'name=1.1', 'name=up', or a patch object. */
  function changesOf(args) {
    const out = [], errors = [], declared = [];
    const one = (name, v) => {
      const r = resolveName(name);
      if (r.kind !== 'knob' && r.kind !== 'lever') { errors.push(name + ' is no lever and no knob' + (r.near && r.near.length ? ' (nearest: ' + r.near.join(', ') + ')' : '')); return; }
      const mult = Number(v), dir = v === 'up' ? 1 : v === 'down' ? -1 : Number.isFinite(mult) && mult !== 1 ? (mult > 1 ? 1 : -1) : 0;
      if (!dir) { errors.push(name + '=' + v + ': say up, down, or a multiplier other than 1'); return; }
      out.push({ unit: r.id, kind: r.kind, dir, mult: Number.isFinite(mult) ? mult : null });
    };
    for (const a of args) {
      if (a && typeof a === 'object') {
        for (const [k, m] of Object.entries(a.knobs || {})) one(k, String(m));
        for (const e of a.edits || []) {
          const hit = ctx.levers.filter((L) => (L.sites || []).some((s) => s.file === e.file && s.text && (s.text.includes(e.from) || String(e.from).includes(s.text.trim()))));
          if (!hit.length) errors.push('an edit of ' + e.file + ' sits on no lever\'s line: the graph cannot say what it moves');
          for (const L of hit) out.push({ unit: L.id, kind: 'lever', dir: 0, mult: null });
        }
        for (const t of a.targets || []) declared.push(t);
      } else { const i = String(a).lastIndexOf('='); if (i < 1) errors.push(a + ': a change is name=1.1, name=up or name=down'); else one(a.slice(0, i), a.slice(i + 1)); }
    }
    return { changes: out, errors, declared };
  }
  /** The outcomes a patch's `targets` name: a metric, a band id, a band id prefix or a band group. */
  const outcomesOfTargets = (names) => [...new Set(names.flatMap((n) => (n.startsWith('metric:') ? [n.slice(7)] : (ctx.bands || []).filter((b) => b.id === n || b.id.startsWith(n + '.') || b.group === n).flatMap((b) => outcomesOfBand(b.on)))))];

  function propose(args, o = {}) {
    const { changes, errors, declared } = changesOf(args);
    if (errors.length || !changes.length) return { exit: 2, lines: ['lab propose: ' + (errors.join('; ') || 'no change given')], data: { error: errors } };
    const full = !!o.full, lines = [], per = [];
    for (const c of changes) {
      const moves = (c.kind === 'knob' ? knob.get(c.unit).moves : lever.get(c.unit).moves).map((m) => ({ q: m.q, sign: c.dir === 0 ? 0 : c.dir === 1 ? m.sign : flip(m.sign) }));
      const units = c.kind === 'knob' ? [c.unit] : lever.get(c.unit).knobs.filter((k) => knob.has(k));
      per.push({ ...c, moves, t: reachOf(moves), units, levers: c.kind === 'knob' ? knob.get(c.unit).levers : [c.unit] });
    }
    lines.push('PROPOSE     ' + per.map((c) => c.unit + (c.mult ? ' x' + c.mult : c.dir === 1 ? ' up' : c.dir === -1 ? ' down' : ' (an edit, direction not read)')).join(', '));
    lines.push(...wrap('MOVES', per.flatMap((c) => c.moves.map((m) => m.q + ' ' + arrow(m.sign) + ' (' + c.unit + ')'))));
    const touched = new Set(), formulas = new Set();
    for (const c of per) for (const [q, v] of c.t) { touched.add(q); if (v.via) formulas.add(v.via); }
    lines.push(...wrap('TOUCHES', [touched.size + ' quantities through ' + formulas.size + ' mechanics', ...cut([...formulas].sort(), 22, full)]));
    const decl = new Set([...per.flatMap((c) => c.levers.flatMap((l) => lever.get(l).outcomes)), ...outcomesOfTargets(declared)]);
    const byPatch = declared.length ? new Set(outcomesOfTargets(declared)) : null;
    lines.push('OUTCOMES    the direction is the graph\'s. The size is a PREDICTION from the measured sweeps, linear between the played steps');
    lines.push('  ' + 'outcome'.padEnd(17) + 'predicted'.padEnd(11) + 'by change'.padEnd(64) + 'size'.padEnd(11) + (byPatch ? 'in the patch\'s targets' : 'declared by its levers'));
    const undeclared = [], rowsOut = [];
    for (const oid of outcomeIds) {
      const parts = per.map((c) => { const p = c.t.get(oid); return p ? { unit: c.unit, sign: p.sign, depth: p.depth } : null; }).filter(Boolean);
      let size = 0, sized = false;
      for (const c of per) for (const u of c.units) {
        const m = measuredUnit(u), row = m && m.outcomes[oid];
        if (!row || row.size === null || row.verdict === 'flat' || !c.mult) continue;
        size += row.size * (c.mult - 1) / (m.steps[1] - m.steps[0]); sized = true;
      }
      if (!parts.length && !sized) continue;
      const signs = [...new Set(parts.map((p) => p.sign))];
      const pred = !parts.length ? 'none' : signs.length === 1 ? arrow(signs[0]) : 'mixed';
      const isDecl = (byPatch || decl).has(oid);
      if (!isDecl) undeclared.push(oid);
      rowsOut.push({ outcome: oid, predicted: pred, parts, size: sized ? size : null, declared: isDecl });
      lines.push('  ' + oid.padEnd(17) + pred.padEnd(11) + (parts.map((p) => p.unit + ' ' + arrow(p.sign) + ' d' + p.depth).join(', ') || 'measured only').slice(0, 62).padEnd(64) + (sized ? pct(size) : '').padEnd(11) + (isDecl ? 'yes' : 'NO'));
    }
    lines.push(...wrap('UNDECLARED', undeclared.length ? [(byPatch ? 'the patch\'s targets' : 'the levers\' declared outcomes') + ' do not name ' + undeclared.length + ' outcome(s) this will probably move: ' + undeclared.join(', ')] : ['every outcome it reaches is declared']));
    const outs = outcomeIds.filter((x) => per.some((c) => c.t.has(x)));
    const ts = targetsOf(outs);
    lines.push(...wrap('TARGETS', ts.length ? cut(ts.map((t) => t.id), 30, full) : ['none']));
    const fs = findingsOn([...per.map((c) => c.unit), ...per.flatMap((c) => c.levers), ...per.flatMap((c) => c.units), ...formulas]);
    const dead = fs.filter((f) => f.kind === 'dead' && per.some((c) => c.units.includes(f.key) || c.unit === f.key));
    for (const f of dead) lines.push('WARNING     ' + f.what);
    const by = {};
    for (const f of fs) by[f.kind] = (by[f.kind] || 0) + 1;
    lines.push('FINDINGS    ' + fs.length + ' on its path: ' + (Object.entries(by).map(([k, n]) => k + ' ' + n).join(', ') || 'none'), ...cut(fs.filter((f) => ['feeds', 'writers', 'call', 'carrier', 'lever-reader'].includes(f.kind)).map((f) => '  ' + f.id + ' [' + f.kind + '] ' + (f.what.length > WIDTH - 26 ? f.what.slice(0, WIDTH - 29) + '...' : f.what)), 6, full));
    /* what must be re-run: where the sweeps saw these knobs move, the scopes of the targets touched, the tests of the levers */
    lines.push('RE-RUN');
    const where = { tier: {}, party: {}, block: {} };
    let anyWhere = false;
    for (const c of per) for (const u of c.units) { const m = measuredUnit(u); if (!m) continue; for (const ax of Object.keys(where)) for (const [k, n] of Object.entries(m.where[ax] || {})) { where[ax][k] = Math.max(where[ax][k] || 0, n); anyWhere = true; } }
    if (anyWhere) for (const ax of Object.keys(where)) lines.push(...wrap('  cells by ' + ax, Object.entries(where[ax]).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ' + n), 18));
    else lines.push('  cells       no sweep has played these levers: every block of the matrix is in doubt');
    const scopes = [...new Set(ts.map((t) => { const raw = ((ctx.targets && ctx.targets.targets) || []).find((x) => x.id === t.id) || {}; const s = raw.scope || {}; return [s.gear ? s.gear.join('/') : 'any gear', s.party ? 'party ' + s.party.join('/') : 'any party', s.tier ? s.tier.join('/') : 'any tier'].join(', '); }))];
    lines.push(...wrap('  scopes', cut(scopes, 10, full), 18));
    const tests = [...new Set(per.flatMap((c) => c.levers.flatMap((l) => (((rawLever.get(l) || {}).tests || {}).asserts || []).map((a) => a.file))))];
    lines.push(...wrap('  tests', tests.length ? tests : ['no asserting test on these levers'], 18));
    lines.push('  play        node tools/balance-program/balance-matrix.mjs --diff <patch.json> --subset   then the full matrix on GitHub (balance-diff.yml)');
    return { exit: 0, lines, data: { changes: per.map((c) => ({ unit: c.unit, kind: c.kind, dir: c.dir, mult: c.mult, moves: c.moves })), outcomes: rowsOut, undeclared, targets: ts.map((t) => t.id), findings: fs.map((f) => f.id), dead: dead.map((f) => f.id), where, scopes, tests } };
  }
  return { ask, propose, resolveName, graph: g, problems: built.problems };
}

function selftest() {
  const fails = [];
  let proofs = 0;
  const ok = (c, what) => { proofs++; if (!c) fails.push(what); };
  const lab = labOf(plantedCtx());
  const text = (r) => r.lines.join('\n');
  const a = lab.ask('blow.skill');
  ok(a.exit === 0 && /LEVER blow\.skill/.test(text(a)) && /src\/core\/fight\.js:3/.test(text(a)), 'ask a lever: its name and where it lives');
  ok(/hero\.maxHit up/.test(text(a)) && /reads .*\+hero\.skill \(core\/fight\.js:3\)/.test(text(a).replace(/\n\s+/g, ' ')), 'ask a lever: what it moves and the typed read with its file and line');
  ok(/depth 1\s+dmg up \(B\)/.test(text(a)) && /depth 2\s+ttk down \(O-TTK\)/.test(text(a)) && /depth 3\s+kills up \(O-KILLS\)/.test(text(a)), 'ask a lever: the reach at depths 1 to 3 with its direction, got\n' + text(a));
  ok(/ttk\s+down d2\s+down -40\.0% \(40\/40 cells\)\s+declared/.test(text(a)) && /levelXpPerH\s+up d4\s+flat/.test(text(a)), 'ask a lever: predicted beside measured beside declared');
  ok(/sign match here: 2 of 2 called/.test(text(a)) && /TARGETS\s+T-1 \(levelXpPerH\)/.test(text(a)), 'ask a lever: the sign match and the targets it touches');
  ok(a.lines.length <= 60 && a.lines.every((l) => l.length <= WIDTH + 2), 'ask fits one screen: ' + a.lines.length + ' lines, longest ' + Math.max(...a.lines.map((l) => l.length)));
  ok(lab.ask('attack').data.kind === 'knob' && lab.ask('attack').data.levers[0] === 'blow.skill', 'ask a knob: it is read as its levers');
  const f = lab.ask('B');
  ok(f.exit === 0 && /FORMULA B/.test(text(f)) && /FED BY\s+A \(hero\.maxHit\) · C \(mon\.defCut\)/.test(text(f)) && /LEVERS\s+no lever names it/.test(text(f)), 'ask a formula: its feeders and its levers, got\n' + text(f));
  const q = lab.ask('kills');
  ok(q.data.kind === 'outcome' && q.data.levers.some((h) => h.lever === 'blow.skill' && h.depth === 3 && h.sign === 1 && h.measured === 'up' && h.declared) && q.data.levers.some((h) => h.lever === 'mon.cut' && h.sign === -1), 'ask an outcome: every lever that reaches it, with direction and measurement');
  const t = lab.ask('T-1');
  ok(t.data.kind === 'target' && t.data.quantities[0] === 'levelXpPerH' && t.data.levers.length === 2, 'ask a target: the outcome it reads and the levers that reach it');
  const none = lab.ask('nothing-like-this');
  ok(none.exit === 2 && /nothing is named/.test(text(none)), 'an unknown name exits 2');
  ok(lab.ask('skill term').data.id === 'blow.skill', 'a name is found by its words when only one thing matches');
  const p = lab.propose(['attack=1.25']);
  ok(p.exit === 0 && p.data.outcomes.find((x) => x.outcome === 'ttk').predicted === 'down' && Math.abs(p.data.outcomes.find((x) => x.outcome === 'ttk').size + 0.2) < 1e-9, 'propose: the direction, and a size read linearly from the measured sweep (-40% over x0.75 to x1.25 is -20% at x1.25)');
  ok(p.data.undeclared.join() === 'levelXpPerH' && /UNDECLARED .*levelXpPerH/.test(text(p)), 'propose: an outcome the change reaches and did not declare is named');
  ok(p.data.targets.join() === 'T-1' && /play\s+node tools\/balance-program\/balance-matrix\.mjs --diff/.test(text(p)), 'propose: the targets touched and what to re-run');
  const down = lab.propose(['attack=0.8']);
  ok(down.data.outcomes.find((x) => x.outcome === 'ttk').predicted === 'up', 'propose: a lever moved down turns every direction over');
  const two = lab.propose(['attack=up', 'mon.cut=up']);
  ok(two.data.outcomes.find((x) => x.outcome === 'ttk').predicted === 'mixed' && two.data.outcomes.find((x) => x.outcome === 'ttk').parts.length === 2, 'propose: two changes that pull one outcome opposite ways read mixed, each named');
  const patch = lab.propose([{ knobs: { attack: 1.1 }, targets: ['metric:ttk'] }]);
  ok(patch.data.undeclared.join() === 'kills,levelXpPerH', 'propose a patch: its own targets are what it declared, and the rest is named');
  ok(lab.propose(['nope=1.1']).exit === 2 && lab.propose(['attack=1']).exit === 2 && lab.propose([]).exit === 2, 'propose: an unknown name, a multiplier of 1 and no change each exit 2');
  const dead = plantedCtx(); for (const o of Object.values(dead.measured.units.attack.outcomes)) { o.moved = 0; o.up = 0; o.verdict = 'flat'; }
  ok(/WARNING .*attack moved no measured outcome/.test(text(labOf(dead).propose(['attack=1.1']))), 'propose: a lever the sweeps found dead carries a warning');
  for (const x of fails) console.error('  ✗ ' + x);
  console.log(fails.length ? 'lab --selftest: ' + fails.length + ' proof(s) FAILED' : 'lab --selftest: ' + proofs + ' proofs hold (ask a lever, a knob, a formula, an outcome and a target; propose a knob, two changes and a patch; an undeclared outcome, a dead lever and an unknown name)');
  return fails.length ? 1 : 0;
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) process.exit(selftest());
  const flags = argv.filter((a) => a.startsWith('--')), rest = argv.filter((a) => !a.startsWith('--'));
  const badFlag = flags.find((x) => !['--full', '--json'].includes(x));
  const verb = rest[0];
  if (badFlag || !['ask', 'propose'].includes(verb) || rest.length < 2) {
    console.error('lab: ' + (badFlag ? 'unknown flag ' + badFlag + '. ' : '') + 'usage: lab.mjs ask <lever|knob|formula|quantity|outcome|target> [--full] [--json]   or   lab.mjs propose <knob=1.1|lever=up|patch.json> ... [--full] [--json]');
    process.exit(2);
  }
  const lab = labOf(await treeCtx(ROOT));
  const o = { full: flags.includes('--full') };
  const args = rest.slice(1).map((a) => (/\.json$/.test(a) && existsSync(resolve(a)) ? JSON.parse(readFileSync(resolve(a), 'utf8')) : a));
  const r = verb === 'ask' ? lab.ask(rest.slice(1).join(' '), o) : lab.propose(args, o);
  if (flags.includes('--json')) console.log(JSON.stringify(r.data, null, 1)); else for (const l of r.lines) console.log(l);
  if (lab.problems.length && r.exit === 0) console.error('lab: the graph has ' + lab.problems.length + ' problem(s). Run node tools/balance-program/graph.mjs --check');
  process.exit(r.exit);
}
