#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/graph.mjs — THE MODEL GRAPH (Balance Lab phase 1, "Picture"; docs/design/redesign/07-balance-lab.md 3.1 and
// the roadmap row "1. Picture"; Tyler approved the phases that need no design decision, 2026-11-21).
// The aim: nobody tunes one number again without seeing everything it touches.
//
//   node tools/balance-program/graph.mjs                 the counts, the problems, the findings by kind, the sign-match rate
//   node tools/balance-program/graph.mjs --write         writes tools/balance-program/graph.json and the generated tables of
//                                                         docs/design/balance-baseline/09-model-graph.md, and drops baseline findings that
//                                                         are gone. It never ADDS a finding to the baseline
//   node tools/balance-program/graph.mjs --write --accept   also takes today's findings onto the baseline (a person's decision)
//   node tools/balance-program/graph.mjs --check         exit 1 on a problem (see below), a finding that is not on the baseline, a baseline
//                                                         finding that is gone, or a graph.json this tree does not build
//   node tools/balance-program/graph.mjs --selftest      plants each fault in memory. Each must be caught and the clean plant must pass
//   node tools/balance-program/graph.mjs --findings [kind]   every finding, ranked, with its id
//   node tools/balance-program/graph.mjs --measure <dir or file> [--run <id>]   rebuilds graph/measured.json from balance-sweeps
//                                                         artifacts (a folder of sweep-*.json or the joined file) or from the sensitivity
//                                                         lane's data/matrix.json
//
// WHAT IT JOINS (no second copy of any fact): formulas/formulas-architecture.json (107 formulas, 197 edges) + graph/io.mjs (their typed
// reads and writes) + graph/quantities.mjs (the closed list) + levers.json (164 levers) + graph/moves.mjs (what each moves) +
// formulas/knobs.json + targets.json and the bands of standards.mjs + graph/measured.json. The file is named graph.mjs because
// tools/balance-program/model.mjs already exists (the economy model's ledgers).
//
// A PROBLEM fails --check outright: a formula with no typed row, a quantity off the list, a lost home, an UNDECLARED read or write (the
// code of a formula's home touches a quantity's token and no formula homed there declares it), a WRONG DECLARATION (a read or write
// the home does not show and no reason explains), a lever declared to move what its formulas do not write, a stale record.
// A FINDING has a stable id (GF-xxxxxxxx, from its kind and its pair, never from a line number). Today's findings are the baseline
// (graph-findings.json). Only a NEW one fails: a diff that introduces an unexplained ghost edge, a sign the measurement contradicts,
// a movement nobody declared.
// A MOVED LINE IS NOT A FAILURE: graph.json is compared with its file:line cites reduced to the file, and --write re-reads them.
//
// Exit: 0 ran / clean · 1 a --check failure or a --selftest proof failed · 2 a bad argument.
// mutant-anchors: none — --selftest plants an in-memory register, in-memory rule files and an in-memory measured table; no tracked file is patched
// ci-step: economy-selftests | Balance model graph - an undeclared read, a wrong declaration, a new ghost edge and a wrong sign are each caught
// ci-run: node tools/mutant-gate.mjs node tools/balance-program/graph.mjs --selftest
// ci-run: node tools/balance-program/graph.mjs --check
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../tests/_is-main.mjs';
import { buildGraph, GRAPH_SCHEMA, FINDING_KINDS, findingId } from './graph/build.mjs';
import { QUANTITIES } from './graph/quantities.mjs';
import { FORMULA_IO, OUTCOME_READERS, OUTCOME_SOURCE, INTERACTIONS, NO_INTERACTION } from './graph/io.mjs';
import { KNOB_MOVES, LEVER_MOVES } from './graph/moves.mjs';
import { fromSweeps, fromSensitivity, verdictOf, MEASURED_SCHEMA } from './graph/measured.mjs';
import { trace, stepsOf, signWord } from './graph/trace.mjs';
import { occurrences, topLevel, importsOf, homeOf } from './graph/derive.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
export const GRAPH_FILE = 'tools/balance-program/graph.json';
export const FINDINGS_FILE = 'tools/balance-program/graph-findings.json';
export const MEASURED_FILE = 'tools/balance-program/graph/measured.json';
export const DOC_FILE = 'docs/design/balance-baseline/09-model-graph.md';
export const FINDINGS_SCHEMA = 'hearthrise.balance-graph-findings/1';
const ARCH_FILE = 'tools/balance-program/formulas/formulas-architecture.json';
const LEVERS_FILE = 'tools/balance-program/levers.json';
const KNOBS_FILE = 'tools/balance-program/formulas/knobs.json';
const TARGETS_FILE = 'tools/balance-program/targets.json';

const lf = (s) => s.replace(/\r\n/g, '\n');
const readJson = (root, f) => (existsSync(join(root, f)) ? JSON.parse(lf(readFileSync(join(root, f), 'utf8'))) : null);

/** Everything buildGraph needs, read from a tree. */
export async function treeCtx(root = ROOT) {
  const arch = readJson(root, ARCH_FILE), levers = readJson(root, LEVERS_FILE), knobs = readJson(root, KNOBS_FILE), targets = readJson(root, TARGETS_FILE);
  const STD = await import('./standards.mjs');
  return {
    arch, levers: levers.levers, knobs: knobs.knobs, targets, bands: STD.BANDS.map((b) => ({ id: b.id, on: b.on })),
    quantities: QUANTITIES, io: FORMULA_IO, readers: OUTCOME_READERS, readerSource: OUTCOME_SOURCE, interactions: INTERACTIONS, noInteraction: NO_INTERACTION,
    leverMoves: LEVER_MOVES, knobMoves: KNOB_MOVES,
    read: (f) => (existsSync(join(root, f)) ? lf(readFileSync(join(root, f), 'utf8')) : null),
    measured: readJson(root, MEASURED_FILE),
  };
}

/* a graph with every file:line cite reduced to its file: what --check compares, so a moved line is never a failure */
const unlined = (v) => (typeof v === 'string' ? v.replace(/(\.(?:js|mjs|ts|sql)):\d+(?:-\d+)?/g, '$1') : Array.isArray(v) ? v.map(unlined) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unlined(x)])) : v);
export const shapeOf = (graph) => JSON.stringify(unlined(graph));

/**
 * THE VERDICT. `built` is buildGraph's answer, `baseline` the accepted finding ids ({ id: { kind, key } } or null), `storedShape` the
 * shape of the graph.json on disk (or null). Answers the list of failures, empty when clean. Pure.
 */
export function judge(built, baseline, storedShape = undefined) {
  const fails = built.problems.map((p) => ({ kind: p.kind, what: p.what }));
  const base = baseline || {};
  const now = new Map(built.findings.map((f) => [f.id, f]));
  for (const f of built.findings) if (!base[f.id]) fails.push({ kind: 'new-finding', what: f.id + ' [' + f.kind + '] ' + f.what });
  for (const [id, b] of Object.entries(base)) if (!now.has(id)) fails.push({ kind: 'stale', what: 'baseline finding ' + id + ' [' + b.kind + '] ' + b.key + ' is gone: run --write to drop it' });
  if (storedShape !== undefined && storedShape !== shapeOf(built.graph)) fails.push({ kind: 'stale', what: GRAPH_FILE + ' is not what this tree builds: run --write' });
  return fails;
}

/* ── THE DOC'S GENERATED TABLES ─────────────────────────────────────────────────────────────────────────────────────────────────── */
const mark = (k) => ['<!-- graph:' + k + ' -->', '<!-- /graph:' + k + ' -->'];
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const pct = (x) => (x === null || x === undefined ? 'n/a' : (x * 100).toFixed(0) + '%');
export function docTables(g) {
  const c = g.counts, t = {};
  t.counts = ['| What | Count |', '|---|---|',
    '| Quantities on the closed list | ' + c.quantities + ' |',
    '| Formulas with typed reads and writes | ' + c.formulas + ' of ' + c.formulas + ' |',
    '| Outcome readers (hand-declared, they stand where E14 stands) | ' + c.readers + ' |',
    '| Reads declared, and how many the code shows (cited file:line) | ' + c.reads + ', ' + c.readsDerived + ' derived |',
    '| Writes declared, and how many the code shows | ' + c.writes + ', ' + c.writesDerived + ' derived |',
    '| Typed edges (one writes what another reads) | ' + c.typedEdges + ' |',
    '| Edges the formula register declares | ' + c.declaredEdges + ' |',
    '| Calls between formula homes, read from the code | ' + c.calls + ' |',
    '| Levers joined, and knobs | ' + c.levers + ', ' + c.knobs + ' |',
    '| Targets joined, and how many reach a measured outcome | ' + c.targets + ', ' + c.targetsWithOutcome + ' |'].join('\n');
  t.findings = ['| Kind | What it is | Count |', '|---|---|---|', ...Object.entries(FINDING_KINDS).map(([k, what]) => '| `' + k + '` | ' + cell(what) + ' | ' + c.findings[k] + ' |')].join('\n');
  const ghosts = g.findings.filter((f) => ['feeds', 'writers', 'carrier', 'call'].includes(f.kind)).sort((a, b) => (b.weight || 0) - (a.weight || 0) || (b.cross ? 1 : 0) - (a.cross ? 1 : 0) || (a.id < b.id ? -1 : 1));
  t.ghosts = ['| # | Id | Kind | Pair | Levers on the pair | Finding |', '|---|---|---|---|---|---|',
    ...ghosts.slice(0, 40).map((f, i) => '| ' + (i + 1) + ' | `' + f.id + '` | ' + f.kind + ' | ' + f.a + ' / ' + f.b + ' | ' + (f.weight || 0) + ' | ' + cell(f.what) + ' |')].join('\n')
    + '\n\n' + ghosts.length + ' ghost edges in all. The rest: `node tools/balance-program/graph.mjs --findings`.';
  if (g.measured) {
    const m = g.measured.match;
    t.match = ['| What | Count |', '|---|---|',
      '| Measured movements with a direction (knob and outcome pairs) | ' + m.measuredSigned + ' |',
      '| The trace called a direction | ' + (m.hit + m.miss) + ' (' + pct(m.coverage) + ' of them) |',
      '| The call matched the measurement | ' + m.hit + ' |',
      '| The call was wrong | ' + m.miss + ' |',
      '| The trace said mixed, unknown or nothing | ' + m.noCall + ' |',
      '| **Sign-match rate** (matched over called) | **' + pct(m.rate) + '** |'].join('\n');
    const miss = g.findings.filter((f) => f.kind === 'sign');
    t.misses = miss.length ? ['| Id | Miss |', '|---|---|', ...miss.map((f) => '| `' + f.id + '` | ' + cell(f.what) + ' |')].join('\n') : 'None.';
    const dead = g.findings.filter((f) => f.kind === 'dead' || f.kind === 'dead-outcome');
    t.dead = dead.length ? ['| Id | Kind | Finding |', '|---|---|---|', ...dead.map((f) => '| `' + f.id + '` | ' + f.kind + ' | ' + cell(f.what) + ' |')].join('\n') : 'None.';
    const und = g.findings.filter((f) => f.kind === 'undeclared-move');
    const by = new Map();
    for (const f of und) { if (!by.has(f.a)) by.set(f.a, []); by.get(f.a).push(f.b); }
    t.undeclared = by.size ? ['| Knob | Outcomes it moved that no lever behind it declares |', '|---|---|', ...[...by.entries()].map(([k, os]) => '| `' + k + '` | ' + os.join(', ') + ' |')].join('\n') : 'None.';
    t.source = 'Measured data: ' + g.measured.source.kind + (g.measured.source.githubRun ? ', GitHub run ' + g.measured.source.githubRun : '') + ', tree ' + (g.measured.source.commit || '?') + (g.measured.source.base ? ', base `' + g.measured.source.base.name + '`' : '')
      + ', ' + (g.measured.source.cells || '?') + ' cells' + (g.measured.source.seeds ? ', ' + g.measured.source.seeds + ' seeds' : '') + (g.measured.source.hours ? ', ' + g.measured.source.hours + ' h a cell' : '') + '. Rule: ' + g.measured.rule.text + '.'
      + '\n\nNot played in that data: ' + (g.measured.notMeasured.join(', ') || 'none') + '. Levers with no measured knob (they wait on the sensitivity lane): ' + g.measured.waiting.length + ' of ' + g.counts.levers + '.';
  }
  const blind = g.targets.filter((x) => !x.outcomes.length);
  t.blind = blind.length + ' of ' + g.targets.length + ' targets reach no measured outcome in the graph: ' + blind.map((x) => x.id).join(', ') + '.';
  return t;
}
function writeDoc(root, g) {
  const p = join(root, DOC_FILE);
  if (!existsSync(p)) return;
  let text = lf(readFileSync(p, 'utf8'));
  for (const [k, body] of Object.entries(docTables(g))) {
    const [a, b] = mark(k);
    const i = text.indexOf(a), j = text.indexOf(b);
    if (i < 0 || j < 0) continue;
    text = text.slice(0, i + a.length) + '\n' + body + '\n' + text.slice(j);
  }
  writeFileSync(p, text);
}

const baselineOf = (root) => { const d = readJson(root, FINDINGS_FILE); return d ? d.findings : null; };
function writeAll(root, built, accept) {
  writeFileSync(join(root, GRAPH_FILE), JSON.stringify(built.graph, null, 1) + '\n');
  const before = baselineOf(root) || {};
  const next = {};
  for (const f of built.findings) if (accept || before[f.id]) next[f.id] = { kind: f.kind, key: f.key };
  const sorted = Object.fromEntries(Object.keys(next).sort().map((k) => [k, next[k]]));
  writeFileSync(join(root, FINDINGS_FILE), JSON.stringify({ schema: FINDINGS_SCHEMA, what: 'The model graph\'s accepted findings (tools/balance-program/graph.mjs). A finding on this list is known. One that is not fails --check. --write only removes, --write --accept adds', findings: sorted }, null, 1) + '\n');
  writeDoc(root, built.graph);
  return { dropped: Object.keys(before).filter((id) => !next[id]).length, added: Object.keys(next).filter((id) => !before[id]).length, held: Object.keys(next).length };
}

function summary(built) {
  const g = built.graph, c = g.counts;
  console.log('graph: ' + c.formulas + ' formulas, ' + c.readers + ' outcome readers, ' + c.quantities + ' quantities, ' + c.levers + ' levers, ' + c.knobs + ' knobs, ' + c.targets + ' targets');
  console.log('  reads ' + c.reads + ' (' + c.readsDerived + ' shown by the code), writes ' + c.writes + ' (' + c.writesDerived + ' shown by the code), typed edges ' + c.typedEdges + ', declared edges ' + c.declaredEdges + ', calls read from code ' + c.calls);
  console.log('  findings: ' + Object.entries(c.findings).map(([k, n]) => k + ' ' + n).join(', '));
  if (g.measured) { const m = g.measured.match; console.log('  sign match: ' + m.hit + ' of ' + (m.hit + m.miss) + ' called (' + pct(m.rate) + '), ' + m.noCall + ' not called, on ' + m.measuredSigned + ' measured movements (' + g.measured.source.kind + (g.measured.source.githubRun ? ' run ' + g.measured.source.githubRun : '') + ')'); }
  else console.log('  no measured table (' + MEASURED_FILE + '): run --measure');
}

/* ── --measure ──────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
function measure(root, src, run) {
  const p = resolve(src);
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const x = join(d, n); if (statSync(x).isDirectory()) walk(x); else if (/\.json$/.test(n)) files.push(x); } };
  if (statSync(p).isDirectory()) walk(p); else files.push(p);
  const docs = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
  const matrix = docs.find((d) => d.schema === 'hearthrise.balance-sensitivity-matrix/1');
  const sweeps = docs.filter((d) => d.schema === 'hearthrise.balance-sweeps/1');
  if (!matrix && !sweeps.length) { console.error('graph --measure: no balance-sweeps doc and no sensitivity matrix under ' + src); return 2; }
  const out = matrix ? fromSensitivity(matrix) : fromSweeps(sweeps, run);
  writeFileSync(join(root, MEASURED_FILE), JSON.stringify(out, null, 1) + '\n');
  console.log('graph --measure: ' + Object.keys(out.units).length + ' units from ' + out.source.kind + ' -> ' + MEASURED_FILE);
  return 0;
}

/* ── THE PROOFS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export function plantedCtx(o = {}) {
  const FILES = {
    'src/core/fight.js': [
      'import { CUT } from "../data/sheet.js?v=1";',
      'export function blow(hero) {',
      '  const maxHit = Math.floor(hero.skill * 2);',
      '  return maxHit;',
      '}',
      'export function cut(mon) { return Math.floor(mon.def * CUT.share); }',
      'export function hurt(mon, n) {',
      '  mon.hp -= Math.max(1, n - cut(mon));',
      '}',
      'export function pay(mon) { return mon.xp; }',
      ''].join('\n'),
    'src/data/sheet.js': 'export const CUT = Object.freeze({ share: 0.03 });\nexport const ROWS = Object.freeze({ wolf: { hp: 40, def: 5, xp: 12 } });\n',
    ...(o.files || {}),
  };
  const q = (id, kind, tokens = []) => ({ id, kind, label: id, tokens });
  const quantities = o.quantities || [q('hero.skill', 'stat', ['skill']), q('hero.maxHit', 'stat', ['maxHit', 'blow']), q('mon.def', 'stat', ['def']), q('mon.defCut', 'stat', ['cut', 'CUT']), q('mon.hp', 'stat', ['hp']),
    q('dmg', 'stat', ['hurt']), q('kill.xp', 'stat', ['xp', 'pay']), q('hero.crit', 'stat', ['crit']), q('ttk', 'outcome'), q('kills', 'outcome'), q('xpPerH', 'outcome')];
  const io = {
    A: { home: ['src/core/fight.js#blow'], reads: ['+hero.skill'], writes: ['hero.maxHit'] },
    C: { home: ['src/core/fight.js#cut'], reads: ['+mon.def'], writes: ['mon.defCut'] },
    B: { home: ['src/core/fight.js#hurt'], reads: [['+hero.maxHit', 'the blow arrives as n'], '-mon.defCut'], writes: ['dmg'], as: { hp: 'dmg' } },
    R: { home: ['src/data/sheet.js#ROWS'], reads: [], writes: ['mon.hp', 'mon.def', 'kill.xp'] },
    X: { home: ['src/core/fight.js#pay'], reads: ['+kill.xp'], writes: [['kill.xp', 'the row\'s xp is what a kill pays']], as: { pay: 'kill.xp' } },
    ...(o.io || {}),
  };
  for (const id of o.dropIo || []) delete io[id];
  return {
    arch: { formulas: (o.formulas || ['A', 'B', 'C', 'R', 'X']).map((id) => ({ id, also: [], categories: ['combat'], state: 'live', what: id, where: '' })),
      edges: o.edges || [{ from: 'A', to: 'B' }, { from: 'C', to: 'B' }, { from: 'R', to: 'C' }, { from: 'R', to: 'X' }] },
    levers: o.levers || [{ id: 'blow.skill', name: 'skill term', category: 'base-damage', class: 'global', formulas: ['A'], outcomes: ['ttk', 'kills'], perturb: { kind: 'knob', knob: 'attack' }, sites: [{ file: 'src/core/fight.js', line: 3, binding: 'blow', text: 'const maxHit' }] },
      { id: 'mon.cut', name: 'defence cut', category: 'monster-stats', class: 'global', formulas: ['C'], outcomes: ['ttk'], perturb: { kind: 'patch' }, sites: [{ file: 'src/data/sheet.js', line: 1, binding: 'CUT', text: 'export const CUT = Object.freeze({ share: 0.03 });' }] }],
    knobs: o.knobs || [{ id: 'attack', formula: 'A' }],
    targets: { targets: o.targets || [{ id: 'T-1', area: 'pace', metric: 'kills', readers: ['K1'], readerState: 'graded' }] },
    bands: [{ id: 'K1', on: 'Level XP an hour' }],
    quantities, io,
    readers: o.readers || { 'O-TTK': { reads: ['+mon.hp', '-dmg'], writes: ['ttk'], why: 'a kill is HP over damage' }, 'O-KILLS': { reads: ['-ttk'], writes: ['kills'], why: 'faster kills, more kills' }, 'O-XP': { reads: ['+kills', '+kill.xp'], writes: ['xpPerH'], why: 'kills times XP' } },
    readerSource: 'tools/x.mjs', interactions: o.interactions || [], noInteraction: o.noInteraction || [],
    leverMoves: o.leverMoves || {}, knobMoves: o.knobMoves || { attack: ['+hero.maxHit'] },
    read: (f) => (FILES[f] == null ? null : FILES[f]),
    measured: o.measured === undefined ? { schema: MEASURED_SCHEMA, source: { kind: 'planted' }, rule: { text: 'planted' }, units: { attack: { kind: 'knob', steps: [0.75, 1.25], cells: 40, outcomes: {
      ttk: { n: 40, moved: 40, up: 0, size: -0.4, verdict: 'down' }, kills: { n: 40, moved: 38, up: 38, size: 0.3, verdict: 'up' }, xpPerH: { n: 40, moved: 0, up: 0, size: null, verdict: 'flat' } }, bands: {}, where: {} } } } : o.measured,
  };
}

function selftest() {
  const fails = [];
  let proofs = 0;
  const ok = (c, what) => { proofs++; if (!c) fails.push(what); };
  const run = (o) => buildGraph(plantedCtx(o));
  const has = (b, kind, bit) => b.problems.some((p) => p.kind === kind && p.what.includes(bit));
  const clean = run({});
  ok(clean.problems.length === 0, 'control: the planted tree has no problem, got ' + JSON.stringify(clean.problems));
  const base = Object.fromEntries(clean.findings.map((f) => [f.id, { kind: f.kind, key: f.key }]));
  ok(judge(clean, base).length === 0, 'control: the planted tree against its own baseline is clean, got ' + JSON.stringify(judge(clean, base)));
  ok(judge(clean, base, shapeOf(clean.graph)).length === 0, 'control: the planted graph against its own stored shape is clean');
  const A = clean.graph.formulas.find((x) => x.id === 'A');
  ok(A.reads[0].how === 'derived' && A.reads[0].at[0] === 'src/core/fight.js:3' && A.writes[0].at.includes('src/core/fight.js:3'), 'a derived read and write each cite their file and line, got ' + JSON.stringify([A.reads[0].at, A.writes[0].at]));
  ok(clean.graph.formulas.find((x) => x.id === 'B').reads[0].how === 'declared', 'a read the code cannot show is marked declared, with its reason');

  /* PLANT 1: an undeclared read in rule code */
  const p1 = run({ files: { 'src/core/fight.js': plantedCtx().read('src/core/fight.js').replace('hero.skill * 2', 'hero.skill * 2 * (1 + hero.crit)') } });
  ok(has(p1, 'undeclared', '`crit`') && has(p1, 'undeclared', 'src/core/fight.js:3'), 'an undeclared read in rule code is caught, with its line');
  /* PLANT 2: an undeclared write in rule code */
  const p2 = run({ files: { 'src/core/fight.js': plantedCtx().read('src/core/fight.js').replace('return mon.xp;', 'mon.hp = 0; return mon.xp;') } });
  ok(has(p2, 'undeclared', 'writes `hp`'), 'an undeclared write in rule code is caught');
  /* PLANT 3: a wrong declaration (a read the home does not show, no reason) is caught, and the same with a reason passes */
  const io = plantedCtx().io;
  ok(has(run({ io: { A: { ...io.A, reads: ['+hero.skill', '+mon.def'] } } }), 'phantom', 'A declares a read of mon.def'), 'a planted wrong read is caught');
  ok(has(run({ io: { A: { ...io.A, writes: ['hero.maxHit', 'dmg'] } } }), 'phantom', 'A declares a write of dmg'), 'a planted wrong write is caught');
  ok(!run({ io: { A: { ...io.A, reads: ['+hero.skill', ['+mon.def', 'the monster is passed in by the caller']] } } }).problems.some((p) => p.kind === 'phantom'), 'the same read with a written reason is not a phantom');
  ok(has(run({ io: { A: { ...io.A, reads: ['+hero.speed'] } } }), 'quantity', 'hero.speed'), 'a quantity off the closed list is caught');
  ok(has(run({ io: { B: { ...io.B, reads: [['+hero.maxHit>mon.hp', 'x'], '-mon.defCut'] } } }), 'io', 'limited to mon.hp'), 'a read limited to a write the formula does not make is caught');
  /* PLANT 4: a formula with no typed row, a row for no formula, a lost home */
  ok(has(run({ dropIo: ['C'] }), 'io', 'C is in the formula register'), 'a formula with no typed row is caught');
  ok(has(run({ io: { Z: io.A } }), 'io', 'row for Z'), 'a typed row for no formula is caught');
  ok(has(run({ io: { A: { ...io.A, home: ['src/core/fight.js#swing'] } } }), 'home', 'no top-level binding swing'), 'a lost home is caught');
  ok(has(run({ io: { A: { ...io.A, home: ['src/core/gone.js#blow'] } } }), 'home', 'not in the tree'), 'a lost home file is caught');
  /* PLANT 5: a lever declared to move what its formulas do not write */
  ok(has(run({ leverMoves: { 'mon.cut': ['+mon.hp'] } }), 'moves', 'mon.cut is declared to move mon.hp'), 'a wrong lever declaration is caught');
  ok(has(run({ knobMoves: { attack: ['+dmg'] } }), 'moves', 'knob attack is declared to move dmg'), 'a wrong knob declaration is caught');
  ok(has(run({ knobMoves: {} }), 'moves', 'knob attack has no declared moves'), 'a knob with no declared move is caught');
  /* PLANT 6: a ghost edge a diff introduces fails, the baselined ones do not */
  const p6 = run({ io: { X: { ...io.X, reads: ['+kill.xp', ['+mon.defCut', 'planted']] } } });
  const new6 = judge(p6, base).filter((f) => f.kind === 'new-finding');
  ok(new6.length === 1 && new6[0].what.includes('[feeds]') && new6[0].what.includes('C writes mon.defCut and X reads it'), 'a new ghost edge is the one failure, got ' + JSON.stringify(judge(p6, base)));
  ok(findingId('feeds', 'C>X') === new6[0].what.split(' ')[0], 'a finding\'s id comes from its kind and its pair');
  /* cleared by a record, and a record that clears nothing is stale */
  ok(judge(run({ io: { X: { ...io.X, reads: ['+kill.xp', ['+mon.defCut', 'planted']] } }, noInteraction: [{ a: 'C', b: 'X', q: 'mon.defCut', because: 'planted: the cut never reaches the payer' }] }), base).length === 0, 'a no-interaction record clears the ghost edge');
  ok(has(run({ noInteraction: [{ a: 'A', b: 'X', q: '*', because: 'x' }] }), 'stale', 'clears no ghost edge'), 'a record that clears nothing is stale');
  ok(judge(run({ io: { X: { ...io.X, reads: ['+kill.xp', ['+mon.defCut', 'planted']] } }, interactions: [{ id: 'I-1', kind: 'feeds', members: ['C', 'X'], q: 'mon.defCut', sign: 1, because: 'planted' }] }), base).length === 0, 'a declared interaction answers the ghost edge');
  /* the shape leaves room for Trait pairs: a pair of two trait nodes is a valid interaction and changes nothing else */
  const p6t = run({ interactions: [{ id: 'I-2', kind: 'pair', members: ['trait:keen', 'trait:steady'], q: 'hero.crit', sign: 1, because: 'planted: two Traits one hero can hold' }] });
  ok(p6t.problems.length === 0 && p6t.graph.interactions.some((x) => x.kind === 'pair' && x.members[0] === 'trait:keen') && judge(p6t, base).length === 0, 'a Trait pair is a declared interaction with no change to the shape');
  ok(has(run({ interactions: [{ id: 'I-3', kind: 'pair', members: ['nobody', 'A'], because: 'x' }] }), 'interaction', 'nobody'), 'an interaction that names no node is caught');
  /* the other ghost kinds */
  ok(run({ edges: [{ from: 'A', to: 'B' }, { from: 'C', to: 'B' }, { from: 'R', to: 'C' }, { from: 'R', to: 'X' }, { from: 'A', to: 'C' }] }).findings.some((f) => f.kind === 'carrier' && f.key === 'A>C'), 'a declared edge with no shared quantity is a finding');
  ok(run({ edges: [{ from: 'A', to: 'B' }, { from: 'C', to: 'B' }, { from: 'R', to: 'C' }] }).findings.some((f) => f.kind === 'writers' && f.key === 'R|X'), 'two writers of one quantity with no edge are a finding');
  ok(run({ io: { B: { ...io.B, reads: [['+hero.maxHit', 'the blow arrives as n']] }, C: { ...io.C } }, edges: [{ from: 'A', to: 'B' }, { from: 'R', to: 'C' }, { from: 'R', to: 'X' }] }).findings.some((f) => f.kind === 'call' && f.key === 'C>B'), 'a call into another home with no declared read is a finding');
  ok(clean.graph.levers.find((L) => L.id === 'mon.cut').readers.some((r) => r.formulas.includes('C') && r.via === 'CUT.share'), 'a lever\'s reader is read from the code, through the import');
  /* a home may be one key of a shared table: the other keys are not its tokens, and a read of that key reaches it */
  const tbl = { 'src/data/sheet.js': 'export const CUT = Object.freeze({ share: 0.03, crit: 1.5 });\nexport const ROWS = Object.freeze({ wolf: { hp: 40, def: 5, xp: 12 } });\n' };
  ok(has(run({ files: tbl, io: { C: { ...plantedCtx().io.C, home: ['src/core/fight.js#cut', 'src/data/sheet.js#CUT'] } } }), 'undeclared', '`crit`'), 'a whole table as a home must answer for every key');
  ok(run({ files: tbl, io: { C: { ...plantedCtx().io.C, home: ['src/core/fight.js#cut', 'src/data/sheet.js#CUT.share'] } } }).problems.length === 0, 'one key of a table as a home answers for that key only');
  ok(has(run({ io: { C: { ...plantedCtx().io.C, home: ['src/data/sheet.js#CUT.nope'] } } }), 'home', 'no table with a key nope'), 'a home on a key the table does not have is caught');
  ok(run({ levers: [...plantedCtx().levers.slice(0, 1), { ...plantedCtx().levers[1], formulas: ['R'] }], leverMoves: { 'mon.cut': ['+mon.def'] } }).findings.some((f) => f.kind === 'lever-reader' && f.key === 'mon.cut|C'), 'a lever read by a formula it does not name is a finding');
  /* PLANT 7: a wrong sign is caught by the measurement */
  ok(clean.graph.measured.match.hit === 2 && clean.graph.measured.match.miss === 0 && clean.graph.measured.match.rate === 1, 'control: the planted trace matches the planted measurement, got ' + JSON.stringify(clean.graph.measured.match));
  const p7 = run({ readers: { ...plantedCtx().readers, 'O-TTK': { reads: ['+mon.hp', '+dmg'], writes: ['ttk'], why: 'planted wrong' } } });
  ok(p7.graph.measured.match.miss === 2 && judge(p7, base).some((f) => f.kind === 'new-finding' && f.what.includes('[sign]') && f.what.includes('attack on ttk')), 'a planted wrong sign shows as a sign miss and fails, got ' + JSON.stringify(p7.graph.measured.match));
  /* declared against measured: an undeclared movement and a dead lever */
  const m8 = plantedCtx().measured; m8.units.attack.outcomes.xpPerH = { n: 40, moved: 30, up: 30, size: 0.2, verdict: 'up' };
  ok(run({ measured: m8 }).findings.some((f) => f.kind === 'undeclared-move' && f.key === 'attack|xpPerH'), 'a measured movement no lever declared is a finding');
  const m9 = plantedCtx().measured; for (const o of Object.values(m9.units.attack.outcomes)) { o.moved = 0; o.up = 0; o.verdict = 'flat'; }
  ok(run({ measured: m9 }).findings.some((f) => f.kind === 'dead' && f.key === 'attack'), 'a played lever that moved nothing is a finding');
  const m10 = plantedCtx().measured; m10.units.attack.outcomes.kills = { n: 40, moved: 1, up: 1, size: 0.02, verdict: 'flat' };
  ok(run({ measured: m10 }).findings.some((f) => f.kind === 'dead-outcome' && f.key === 'attack|kills'), 'a declared outcome that did not move is a finding');
  ok(run({ measured: null }).graph.measured === null && run({ measured: null }).problems.length === 0, 'no measured table is no problem: the compare waits');
  /* a moved line is no failure, a baseline finding that is gone is */
  const moved = run({ files: { 'src/core/fight.js': '// a new first line\n' + plantedCtx().read('src/core/fight.js') } });
  ok(moved.graph.formulas.find((x) => x.id === 'A').reads[0].at[0] === 'src/core/fight.js:4' && judge(moved, base, shapeOf(clean.graph)).length === 0, 'a moved line re-cites and fails nothing');
  ok(judge(clean, { ...base, 'GF-00000000': { kind: 'feeds', key: 'Q>Z' } }).some((f) => f.kind === 'stale' && f.what.includes('GF-00000000')), 'a baseline finding that is gone is stale');
  ok(judge(p6, base, shapeOf(clean.graph)).some((f) => f.kind === 'stale' && f.what.includes('graph.json')), 'a graph.json the tree does not build is stale');

  /* THE TRACE: depth, polarity, a mixed call, a counter-path, an offline read */
  const steps = stepsOf([{ id: 'm1', reads: [{ q: 'a', sign: 1 }], writes: [{ q: 'b' }] }, { id: 'm2', reads: [{ q: 'b', sign: -1 }], writes: [{ q: 'c' }] }, { id: 'm3', reads: [{ q: 'a', sign: 1 }, { q: 'c', sign: 1 }], writes: [{ q: 'd' }] },
    { id: 'm4', reads: [{ q: 'b', sign: 1 }, { q: 'x', sign: 1, offline: true }], writes: [{ q: 'e' }] }, { id: 'm5', reads: [{ q: 'b', sign: -1 }], writes: [{ q: 'e' }] }, { id: 'm6', reads: [{ q: 'e', sign: 0 }], writes: [{ q: 'f' }] },
    { id: 'm7', reads: [{ q: 'a', sign: 1, to: ['g'] }], writes: [{ q: 'g' }, { q: 'h' }] }]);
  const t = trace(steps, [{ q: 'a', sign: 1 }]);
  ok(t.get('b').depth === 1 && t.get('b').sign === 1 && t.get('c').depth === 2 && t.get('c').sign === -1, 'the trace carries a direction through a + and flips it through a -');
  ok(t.get('d').depth === 1 && t.get('d').sign === 1 && t.get('d').counter && t.get('d').counter.depth === 3 && t.get('d').counter.sign === -1, 'the shortest path decides and a longer opposite path is kept as the counter');
  ok(t.get('e').sign === 'mixed' && signWord(t.get('e').sign) === 'mixed', 'two shortest paths that disagree are mixed');
  ok(t.get('f').sign === 0 || t.get('f').sign === 'mixed', 'a ~ read makes the direction unknown');
  ok(!trace(steps, [{ q: 'x', sign: 1 }]).has('e'), 'an offline read passes nothing on');
  ok(t.has('g') && !t.has('h'), 'a read limited to one write reaches only that write');
  ok(trace(steps, [{ q: 'a', sign: -1 }]).get('c').sign === 1, 'a lever moved down turns every direction over');
  const slow = [{ id: 's1', reads: [{ q: 'xp', sign: 1, career: true }], writes: [{ q: 'level' }] }];
  ok(!trace(stepsOf(slow), [{ q: 'xp', sign: 1 }]).has('level') && trace(stepsOf(slow, { career: true }), [{ q: 'xp', sign: 1 }]).get('level').sign === 1, 'a career read passes nothing inside one hunt, and is traced when asked');

  /* THE DERIVATION */
  const occ = occurrences('x.js', 'export function f(u, n) { const { hp } = u; u.mana -= n; u.shield = 0; return { maxHit: g(u.atk) }; }\nconst T = { a: 1 };\n');
  const mode = (tok) => occ.filter((x) => x.token === tok).map((x) => x.mode).join('');
  ok(mode('hp') === 'r' && mode('mana') === 'w' && mode('shield') === 'w' && mode('maxHit') === 'w' && mode('atk') === 'r' && mode('f') === 'w', 'a destructured field and a property read are reads; an assignment, an object key and the binding\'s own name are writes');
  ok(topLevel('x.js', 'export function f() {}\nexport const T = 1, U = () => 2;\n').map((b) => b.name + ':' + b.kind).join() === 'f:function,T:value,U:function', 'top-level bindings are listed with their kind');
  ok(importsOf('src/core/a.js', 'import { X as Y } from "../data/b.js?v=0.2.1";\nimport ts from "typescript";\n').get('Y').file === 'src/data/b.js', 'an import is resolved to its file, its version query dropped');
  ok(homeOf('src/core/combat.js:358-426 playerCombatRolls').names[0] === 'playerCombatRolls' && homeOf('supabase/migrations/x.sql (hr_fee)').file.endsWith('.sql') && homeOf('') === null, 'a register row\'s where is read as a file, lines and names');

  /* THE MEASURED TABLE */
  ok(verdictOf(40, 40) === 'up' && verdictOf(40, 2) === 'down' && verdictOf(40, 22) === 'unresolved' && verdictOf(5, 5) === 'flat' && verdictOf(10, 10) === 'up' && verdictOf(9, 7) === 'unresolved', 'the sign test reads up, down, unresolved and flat');
  const sweep = { schema: 'hearthrise.balance-sweeps/1', metrics: [{ id: 'ttk' }, { id: 'kills' }], commit: 'abc', treeHash: 't', run: 'subset', seeds: 2, hours: 1, cells: Array.from({ length: 12 }, (_, i) => ({ key: 'c' + i, tier: i < 6 ? 'normal' : 'deadly', party: 1, block: 'ways' })),
    baseline: Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['c' + i, [10, 100]])),
    knobs: { attack: { label: 'Attack', steps: { 0.75: { applied: ['src/core/fight.js:3 2->1.5'], cells: Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['c' + i, [13, 100]])), bands: [['w', 'K1', 'pace', 'x', 1, 0.8]] }, 1.25: { cells: Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['c' + i, [8, 100.5]])), bands: [] } } },
      idle: { label: 'Idle', steps: { 0.9: { cells: {} }, 1.1: { cells: {} } } } } };
  const ms = fromSweeps([sweep], '123');
  ok(ms.units.attack.outcomes.ttk.verdict === 'down' && ms.units.attack.outcomes.ttk.moved === 12 && ms.units.attack.outcomes.kills.verdict === 'flat' && ms.units.attack.bands.K1 === 1 && ms.units.attack.where.tier.deadly === 6 && ms.source.githubRun === '123', 'a sweep reads as a measured unit: direction, moved cells, bands, where it moved');
  ok(ms.units.idle.cells === 0 && ms.units.idle.notPlayed, 'a knob with no played cell reads as not played');
  const sens = fromSensitivity({ schema: 'hearthrise.balance-sensitivity-matrix/1', cells: [1, 2], seedSets: [4], oat: { attack: { kind: 'knob', label: 'Attack', intends: ['dps'], steps: { 0.5: { all: { ttk: { k: 'r', e: 0.9, s: 0.01, r: 1 }, kills: { k: 'r', e: -0.4, s: 0.01, r: 1 }, heal: { k: 'r', e: 0.001, s: 0.01, r: 0 } } }, 2: { all: { ttk: { k: 'r', e: -0.5, s: 0.01, r: 1 }, kills: { k: 'r', e: 0.9, s: 0.01, r: 1 }, heal: { k: 'r', e: 0.002, s: 0.01, r: 0 } } } } } } });
  ok(sens.units.attack.outcomes.ttk.verdict === 'down' && sens.units.attack.outcomes.kills.verdict === 'up' && sens.units.attack.outcomes.heal.verdict === 'flat', 'the sensitivity matrix reads into the same table: a resolved effect has a direction, noise is flat');

  for (const f of fails) console.error('  ✗ ' + f);
  console.log(fails.length ? 'graph --selftest: ' + fails.length + ' proof(s) FAILED' : 'graph --selftest: ' + proofs + ' proofs hold (undeclared read, undeclared write, wrong declaration, lost home, wrong lever, new ghost edge, wrong sign, undeclared movement, dead lever, stale record; a moved line, a reason and a Trait pair pass)');
  return fails.length ? 1 : 0;
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const known = ['--write', '--accept', '--check', '--selftest', '--findings', '--measure', '--run', '--problems'];
  const valued = new Set(['--findings', '--measure', '--run']);
  const bad = argv.find((a, i) => a.startsWith('--') ? !known.includes(a) : !(i > 0 && valued.has(argv[i - 1])));
  if (bad) { console.error('graph: unknown argument ' + bad + ' (takes ' + known.join(', ') + ')'); process.exit(2); }
  const val = (k) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };
  if (argv.includes('--selftest')) process.exit(selftest());
  if (argv.includes('--measure')) { if (!val('--measure')) { console.error('graph --measure needs a folder or a file'); process.exit(2); } process.exit(measure(ROOT, val('--measure'), val('--run'))); }
  const built = buildGraph(await treeCtx(ROOT));
  if (argv.includes('--findings')) {
    const kind = val('--findings');
    for (const f of built.findings) if (!kind || f.kind === kind) console.log(f.id + '  [' + f.kind + ']' + (f.weight !== undefined ? ' w' + f.weight : '') + '  ' + f.what);
    process.exit(0);
  }
  if (argv.includes('--write')) {
    const r = writeAll(ROOT, built, argv.includes('--accept'));
    summary(built);
    console.log('graph --write: wrote ' + GRAPH_FILE + '; baseline holds ' + r.held + ' finding(s) (' + r.added + ' added, ' + r.dropped + ' dropped)');
    for (const p of built.problems) console.error('  ✗ [' + p.kind + '] ' + p.what);
    process.exit(built.problems.length ? 1 : 0);
  }
  summary(built);
  const stored = existsSync(join(ROOT, GRAPH_FILE)) ? shapeOf(JSON.parse(lf(readFileSync(join(ROOT, GRAPH_FILE), 'utf8')))) : null;
  const fails = judge(built, baselineOf(ROOT), stored === null ? '' : stored);
  const show = argv.includes('--check') || argv.includes('--problems');
  if (show) for (const f of fails) console.error('  ✗ [' + f.kind + '] ' + f.what);
  else if (fails.length) console.log('  ' + fails.length + ' --check failure(s): ' + Object.entries(fails.reduce((a, f) => { a[f.kind] = (a[f.kind] || 0) + 1; return a; }, {})).map(([k, n]) => k + ' ' + n).join(', '));
  process.exit(argv.includes('--check') && fails.length ? 1 : 0);
}
