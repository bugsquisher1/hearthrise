// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/targets.mjs — THE TARGET SPECIFICATION'S CHECK (balance baseline deliverable 3, 2026-11-21).
// The data is tools/balance-program/targets.json. The words are docs/design/balance-baseline/03-targets.md.
//
//   node tools/balance-program/targets.mjs --check      exit 1 if any target names a reader that does not exist, or the file is malformed
//   node tools/balance-program/targets.mjs --strict     --check, and also exit 1 if a standing band answers to no target and is not listed
//   node tools/balance-program/targets.mjs --selftest   every planted fault must be caught, and the real file must pass
//   node tools/balance-program/targets.mjs --summary    counts by class and area, the coverage gaps, the unguarded hard constraints
//
// A READER is one of: a standing band id of standards.mjs BANDS (never a dropped or retired one), an OTHER_STANDARDS id (X2..X28,
// never a retired one), table:NAME (a named non-function export of standards.mjs), guard:ID (a line of guard-cells.mjs LINES),
// or MISSING alone (a coverage gap, which must name its gap). Nothing here judges a cell: this file checks the spec, the matrix reads it.
// mutant-anchors: none — --selftest plants faults on in-memory targets; no tracked file is patched
// ci-step: economy-selftests | Balance targets - a reader that does not exist, a malformed target and a planted fault are each caught
// ci-run: node tools/mutant-gate.mjs node tools/balance-program/targets.mjs --selftest
// ci-run: node tools/balance-program/targets.mjs --check
//
// PURE ESM. Reads targets.json, imports standards.mjs and guard-cells.mjs. Writes nothing.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as STD from './standards.mjs';
import { LINES as GUARD_LINES } from './guard-cells.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const TARGETS_FILE = join(HERE, 'targets.json');

const CLASSES = ['HARD', 'SOFT', 'HYPOTHESIS'];
const BASES = ['ruled', 'ruled-sitting', 'ruled-call', 'designer', 'built', 'proposed'];
const STATES = ['graded', 'report', 'proxy', 'other-tool', 'table', 'unread', 'missing'];
const CONFLICT_STATES = ['open', 'reader-mismatch'];
const SOURCE_KINDS = ['old-ruling', 'overhaul-book', 'designer-ruling', 'measurement'];
const FORMS = ['rule', 'range', 'proposal'];
const DATE = /^20\d\d-\d\d-\d\d$/;

/** The reader context from the live tables (a selftest passes its own). */
export function liveContext() {
  return { STD, guardIds: new Set(GUARD_LINES.map((l) => l.id)) };
}

/** What a reader string resolves to: { kind, ok, why }. */
export function resolveReader(id, ctx) {
  const { STD: S, guardIds } = ctx;
  if (id === 'MISSING') return { kind: 'missing', ok: true };
  if (id.startsWith('guard:')) { const g = id.slice(6); return guardIds.has(g) ? { kind: 'guard', ok: true } : { kind: 'guard', ok: false, why: 'unknown reader: no balance guard line ' + g }; }
  if (id.startsWith('table:')) {
    const n = id.slice(6), v = S[n];
    if (v === undefined) return { kind: 'table', ok: false, why: 'unknown reader: standards.mjs exports no ' + n };
    if (typeof v === 'function' || v === null || typeof v !== 'object') return { kind: 'table', ok: false, why: 'unknown reader: standards.mjs ' + n + ' is not a table' };
    return { kind: 'table', ok: true };
  }
  const x = S.OTHER_STANDARDS.find((s) => s.id === id);
  if (x) return x.verdict === 'retired' ? { kind: 'standard', ok: false, why: 'retired reader: ' + id + ' (' + x.band + ')' } : { kind: 'standard', ok: true };
  const b = S.BANDS.find((r) => r.id === id);
  if (!b) return { kind: 'band', ok: false, why: 'unknown reader: no band ' + id + ' in standards.mjs' };
  if (b.dropped) return { kind: 'band', ok: false, why: 'dropped reader: ' + id + ' (' + b.dropped + ')' };
  if (b.retired) return { kind: 'band', ok: false, why: 'retired reader: ' + id };
  return { kind: 'band', ok: true, band: b };
}

/** Every string in a value, with its path. */
function strings(v, path, out) {
  if (typeof v === 'string') out.push([path, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, path + '[' + i + ']', out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) strings(x, path + '.' + k, out);
  return out;
}

/** Every problem with the spec, as strings. Empty = good. */
export function validate(doc, ctx = liveContext()) {
  const out = [];
  if (!doc || typeof doc !== 'object') return ['not an object'];
  for (const k of ['targets', 'leverRules', 'conflicts', 'notTargets', 'untargetedReaders', 'areas', 'constraints']) if (!Array.isArray(doc[k])) out.push('missing array: ' + k);
  if (out.length) return out;
  const areas = new Set(doc.areas.map((a) => a.id));
  if (areas.size !== 10) out.push('the spec covers ' + areas.size + ' areas, not the ten of the directive');
  const ids = new Set(), kids = new Set(doc.conflicts.map((k) => k.id)), targetReaders = new Set();
  for (const t of doc.targets) {
    const at = t.id || '(no id)';
    if (!/^[A-Z]+-\d+$/.test(t.id || '')) out.push(at + ': bad id');
    if (ids.has(t.id)) out.push(at + ': id twice'); ids.add(t.id);
    if (!areas.has(t.area)) out.push(at + ': area ' + t.area);
    if (!CLASSES.includes(t.class)) out.push(at + ': class ' + t.class);
    if (!BASES.includes(t.basis)) out.push(at + ': basis ' + t.basis);
    if (!SOURCE_KINDS.includes(t.sourceKind)) out.push(at + ': sourceKind ' + t.sourceKind);
    if (!FORMS.includes(t.form)) out.push(at + ': form ' + t.form);
    /* the inventory (re-scope 2026-11-21): no target is hard until the new design is defined. Hard lines live in constraints */
    if (doc.status && /^INVENTORY/.test(doc.status) && t.class !== 'HYPOTHESIS') out.push(at + ': class ' + t.class + ' in the inventory, where every target is a HYPOTHESIS');
    if (t.plannedReaders && (t.readerState !== 'missing' || !Array.isArray(t.plannedReaders) || !t.plannedReaders.length)) out.push(at + ': plannedReaders only stand in for a MISSING reader');
    for (const f of ['metric', 'source', 'why']) if (typeof t[f] !== 'string' || !t[f].trim()) out.push(at + ': no ' + f);
    if (!DATE.test(t.date || '')) out.push(at + ': date ' + t.date);
    if (!t.scope || typeof t.scope.text !== 'string' || !t.scope.text.trim()) out.push(at + ': no scope');
    const b = t.band || {};
    const numeric = ['lo', 'hi'].some((k) => typeof b[k] === 'number');
    if (!numeric && !(typeof b.rule === 'string' && b.rule.trim())) out.push(at + ': no band (a lo or hi, or a rule)');
    if (typeof b.lo === 'number' && typeof b.hi === 'number' && b.lo > b.hi) out.push(at + ': band lo over hi');
    if (!Array.isArray(t.readers) || !t.readers.length) { out.push(at + ': no reader (name one, or MISSING)'); continue; }
    if (t.readers.includes('MISSING') && t.readers.length > 1) out.push(at + ': MISSING stands alone');
    if (!STATES.includes(t.readerState)) out.push(at + ': readerState ' + t.readerState);
    const missing = t.readers.length === 1 && t.readers[0] === 'MISSING';
    if (missing !== (t.readerState === 'missing')) out.push(at + ': readerState ' + t.readerState + ' does not match readers ' + t.readers.join(', '));
    if (missing && !(typeof t.gap === 'string' && t.gap.trim())) out.push(at + ': a MISSING reader must name its gap');
    const resolved = t.readers.map((r) => [r, resolveReader(r, ctx)]);
    for (const [r, v] of resolved) { if (!v.ok) out.push(at + ': ' + v.why); else if (r !== 'MISSING') targetReaders.add(r); }
    const bands = resolved.filter(([, v]) => v.ok && v.kind === 'band').map(([, v]) => v.band);
    if (t.readerState === 'graded' && (!bands.length || bands.every((x) => x.reportOnly))) out.push(at + ': readerState graded, but no reader is a band that grades');
    for (const k of t.conflicts || []) if (!kids.has(k)) out.push(at + ': names conflict ' + k + ', which does not exist');
  }
  const kseen = new Set();
  for (const k of doc.conflicts) {
    if (!/^K-\d+$/.test(k.id || '')) out.push((k.id || '(no id)') + ': bad conflict id');
    if (kseen.has(k.id)) out.push(k.id + ': conflict id twice'); kseen.add(k.id);
    if (!CONFLICT_STATES.includes(k.status)) out.push(k.id + ': status ' + k.status);
    for (const f of ['title', 'what', 'evidence', 'tradeoff', 'needs']) if (typeof k[f] !== 'string' || !k[f].trim()) out.push(k.id + ': no ' + f);
    for (const id of k.targets || []) if (!ids.has(id)) out.push(k.id + ': names target ' + id + ', which does not exist');
  }
  const lseen = new Set();
  for (const l of doc.leverRules) {
    if (!/^LR-\d+$/.test(l.id || '') || lseen.has(l.id)) out.push((l.id || '(no id)') + ': bad or repeated lever rule id'); lseen.add(l.id);
    if (!l.rule || !l.source || !DATE.test(l.date || '')) out.push(l.id + ': a lever rule needs rule, source and date');
  }
  for (const c of doc.constraints) {
    if (!/^HC-\d+$/.test(c.id || '') || !c.rule || !c.source || !['mission', 'technical'].includes(c.kind)) out.push((c.id || '(no id)') + ': a constraint needs an id, a rule, a source, and kind mission or technical');
    if (c.reader) { const v = resolveReader(c.reader, ctx); if (!v.ok) out.push(c.id + ': ' + v.why); }
  }
  for (const n of doc.notTargets) if (!n.id || !n.what || !n.why || !DATE.test(n.date || '')) out.push((n.id || '(no id)') + ': a not-target needs what, why and date');
  for (const u of doc.untargetedReaders) {
    const v = resolveReader(u.id, ctx);
    if (v.kind !== 'band' || !STD.BANDS.some((b) => b.id === u.id)) out.push('untargeted ' + u.id + ': not a band in standards.mjs');
    if (targetReaders.has(u.id)) out.push('untargeted ' + u.id + ': a target reads it, so it is not untargeted');
    if (!u.why) out.push('untargeted ' + u.id + ': no reason');
  }
  /* plain English (the brief, 2026-11-21): no semicolons and no em dashes anywhere in the spec */
  for (const [p, s] of strings(doc, '$', [])) if (s.includes(';') || s.includes('—')) out.push(p + ': a semicolon or an em dash');
  return out;
}

/** Coverage both ways: targets with no reader, hard constraints nothing grades, standing bands that answer to nothing. */
export function coverage(doc, ctx = liveContext()) {
  const read = new Set(doc.targets.flatMap((t) => t.readers));
  const listed = new Set(doc.untargetedReaders.map((u) => u.id));
  return {
    missing: doc.targets.filter((t) => t.readerState === 'missing').map((t) => t.id),
    /* a hard constraint nothing grades: no reader, a report-only one, a named standard with no band row, or a stand-in row. Another tool's
       reading (atlas, paths, guard, start cards) and an input table (the death cost) are read elsewhere and are not counted here */
    unguardedHard: doc.targets.filter((t) => (t.class === 'HARD' || t.form === 'rule') && ['missing', 'report', 'unread', 'proxy'].includes(t.readerState)).map((t) => t.id + ' (' + t.readerState + ')'),
    unclassifiedBands: ctx.STD.STANDING.filter((b) => !read.has(b.id) && !listed.has(b.id)).map((b) => b.id),
    dropped: ctx.STD.DROPPED.slice(),
  };
}

export function loadTargets(file = TARGETS_FILE) { return JSON.parse(readFileSync(file, 'utf8')); }

function summary(doc) {
  const count = (k, v) => doc.targets.filter((t) => t[k] === v).length;
  console.log('classes: ' + CLASSES.map((c) => c + ' ' + count('class', c)).join(', '));
  console.log('areas:   ' + doc.areas.map((a) => a.id + ' ' + count('area', a.id)).join(', '));
  console.log('readers: ' + STATES.map((s) => s + ' ' + count('readerState', s)).join(', '));
  console.log('sources: ' + SOURCE_KINDS.map((s) => s + ' ' + count('sourceKind', s)).join(', ') + '. Forms: ' + FORMS.map((f) => f + ' ' + count('form', f)).join(', '));
  const landed = doc.targets.flatMap((t) => (t.plannedReaders || []).filter((p) => resolveReader(p, liveContext()).ok).map((p) => t.id + ' -> ' + p));
  if (landed.length) console.log('planned readers that now exist (name them as the reader): ' + landed.join(', '));
  const c = coverage(doc);
  console.log('coverage gaps (MISSING), ' + c.missing.length + ': ' + c.missing.join(', '));
  console.log('rule-form candidates nothing grades, ' + c.unguardedHard.length + ': ' + c.unguardedHard.join(', '));
  console.log('conflicts: ' + doc.conflicts.length + ' (' + CONFLICT_STATES.map((s) => s + ' ' + doc.conflicts.filter((k) => k.status === s).length).filter((x) => !/ 0$/.test(x)).join(', ') + ')');
  console.log('readers with no target, listed: ' + doc.untargetedReaders.length + ', unclassified: ' + (c.unclassifiedBands.join(', ') || 'none'));
}

/* THE SELFTEST: every planted fault is caught, by the line that names it, and the real file passes. */
function selftest() {
  const real = loadTargets();
  const fails = [];
  const base = validate(real);
  if (base.length) fails.push('the real file fails: ' + base.slice(0, 3).join(' | '));
  const clone = () => JSON.parse(JSON.stringify(real));
  const first = (d) => d.targets.find((t) => t.readers[0] !== 'MISSING' && t.readerState !== 'graded') || d.targets[0];
  const plants = [
    ['a reader that does not exist', /unknown reader: no band Z99/, (d) => { first(d).readers = ['Z99']; }],
    ['a dropped band as a reader', /dropped reader: P6\.4/, (d) => { first(d).readers = ['P6.4']; }],
    ['a retired band as a reader', /retired reader: G-9/, (d) => { first(d).readers = ['G-9']; }],
    ['a retired standard as a reader', /retired reader: X1/, (d) => { first(d).readers = ['X1']; }],
    ['a guard line that does not exist', /no balance guard line G99/, (d) => { first(d).readers = ['guard:G99']; }],
    ['a function named as a table', /validate is not a table/, (d) => { first(d).readers = ['table:validate']; }],
    ['an export that does not exist', /exports no NOPE/, (d) => { first(d).readers = ['table:NOPE']; }],
    ['MISSING beside a reader', /MISSING stands alone/, (d) => { first(d).readers = ['P1', 'MISSING']; }],
    ['MISSING with no gap', /must name its gap/, (d) => { const t = d.targets.find((x) => x.readerState === 'missing'); delete t.gap; }],
    ['graded on report-only bands', /no reader is a band that grades/, (d) => { const t = d.targets.find((x) => x.readerState === 'graded'); t.readers = ['S3.mid']; }],
    ['a date that is not a date', /date yesterday/, (d) => { d.targets[0].date = 'yesterday'; }],
    ['a class outside the three', /class MAYBE/, (d) => { d.targets[0].class = 'MAYBE'; }],
    ['an id twice', /id twice/, (d) => { d.targets[1].id = d.targets[0].id; }],
    ['no band and no rule', /no band/, (d) => { d.targets[0].band = {}; }],
    ['a conflict naming no target', /names target NOPE-1/, (d) => { d.conflicts[0].targets = ['NOPE-1']; }],
    ['a target naming no conflict', /names conflict K-999/, (d) => { d.targets[0].conflicts = ['K-999']; }],
    ['an untargeted band a target reads', /a target reads it/, (d) => { d.untargetedReaders.push({ id: 'P1', why: 'x' }); }],
    ['a semicolon', /a semicolon or an em dash/, (d) => { d.targets[0].why += '; so'; }],
    ['nine areas', /covers 9 areas/, (d) => { d.areas.pop(); }],
    ['a hard target in the inventory', /class HARD in the inventory/, (d) => { d.targets[0].class = 'HARD'; }],
    ['a source kind outside the four', /sourceKind gossip/, (d) => { d.targets[0].sourceKind = 'gossip'; }],
    ['a planned reader beside a real one', /plannedReaders only stand in/, (d) => { first(d).plannedReaders = ['TL9']; }],
    ['a constraint with an unknown reader', /HC-\d+: unknown reader/, (d) => { d.constraints[0].reader = 'Z98'; }],
    ['a constraint that is neither mission nor technical', /kind mission or technical/, (d) => { d.constraints[0].kind = 'taste'; }],
  ];
  for (const [name, expect, plant] of plants) {
    const d = clone(); plant(d);
    const got = validate(d);
    if (!got.some((s) => expect.test(s))) fails.push('NOT CAUGHT: ' + name + (got.length ? ' (got: ' + got[0] + ')' : ' (no problem reported)'));
  }
  /* CONTROL: a harmless edit stays clean, so the check is not failing everything */
  const ok = clone(); ok.targets[0].reading = 'a new reading'; if (validate(ok).length) fails.push('CONTROL: a harmless edit was refused');
  /* STRICT: a standing band that answers to nothing is seen */
  const s = clone(); s.untargetedReaders = s.untargetedReaders.filter((u) => u.id !== 'C5');
  if (!coverage(s).unclassifiedBands.includes('C5')) fails.push('NOT CAUGHT: an unclassified standing band (strict)');
  if (coverage(real).unclassifiedBands.length) fails.push('the real file leaves standing bands unclassified: ' + coverage(real).unclassifiedBands.join(', '));
  for (const f of fails) console.error('FAIL ' + f);
  console.log('targets selftest: ' + (plants.length + 2) + ' cases, ' + fails.length + ' failed');
  return fails.length ? 1 : 0;
}

if (typeof process !== 'undefined' && process.argv && process.argv[1] && /targets\.mjs$/.test(process.argv[1])) {
  const a = process.argv.slice(2);
  if (a.includes('--selftest')) process.exit(selftest());
  const doc = loadTargets();
  if (a.includes('--summary')) summary(doc);
  if (a.includes('--check') || a.includes('--strict') || !a.length) {
    const bad = validate(doc);
    const unclassified = coverage(doc).unclassifiedBands;
    for (const line of bad) console.error('BAD  ' + line);
    if (unclassified.length) console.error((a.includes('--strict') ? 'BAD  ' : 'WARN ') + 'standing bands that answer to no target and are not listed: ' + unclassified.join(', '));
    console.log(`targets: ${doc.targets.length} targets (${CLASSES.map((c) => c + ' ' + doc.targets.filter((t) => t.class === c).length).join(', ')}), ${doc.leverRules.length} lever rules, ${doc.conflicts.length} conflicts, ${bad.length} problems`);
    process.exit(bad.length || (a.includes('--strict') && unclassified.length) ? 1 : 0);
  }
}
