#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/levers.mjs — THE BALANCE LEVER REGISTRY (Tyler's baseline directive of 2026-11-21, deliverable 2; lane BL-2).
//
//   node tools/balance-program/levers.mjs              the counts, the problems, and how many lines and values moved since --write
//   node tools/balance-program/levers.mjs --write      writes tools/balance-program/levers.json (every lever, its 8 fields, the binding pins)
//                                                      and the generated tables in docs/design/balance-baseline/02-lever-registry.md. Reads
//                                                      origin/main through git for the live column (BL-1's baseline is the live game)
//   node tools/balance-program/levers.mjs --check      exit 1 on a STRUCTURAL problem: a top-level binding in the rule code that holds a typed
//                                                      number and no lever row or not-a-lever reason claims; a NEW typed number or a new key in
//                                                      a pinned binding; a lever site whose anchor is gone; a knob, patch or test a row names
//                                                      that does not hold; levers.json not written from today's rows. A moved line or value is
//                                                      NOT a failure (a balance lane moves values): it is counted and --write re-reads it
//   node tools/balance-program/levers.mjs --selftest   plants files in memory; each structural problem must be caught and a value change
//                                                      must not be
//
// WHAT A LEVER IS. A number (or a table of numbers) the game reads that moves a balance outcome. Each row carries Tyler's seven fields
// and an eighth (how the simulator perturbs it), authored in tools/balance-program/levers/*.mjs: the judgment (range, systems, class,
// evidence, flags) by a person, everything that can be read from the tree (file:line, the source line, the binding, row counts, which
// tests mention it, the live game's line, the formula graph's reach) by this file. A content attribute that repeats per row is ONE lever
// with its rows counted, never a lever a row.
//
// THE UNIT THE CHECK COUNTS is census.mjs bindingsOf: every top-level binding of src/core, src/data and supabase/functions/hr-accrue
// that holds a typed number (any literal but 0, 1, 2, 100 and 1000). Every one is claimed: by a lever site (the binding the anchor's line
// sits in), a lever's row table (`rows.homes`), or a NOT_LEVERS reason. A claim PINS what it holds: `count` (the typed numbers and the
// keys they sit under: a coefficient home or a function), `keys` (the keys only: a content table may grow rows, never a new numeric
// field), `open` (nothing: a table keyed by content ids). Numbers 0, 1, 2, 100 and 1000 are invisible to the count (census's rule), so a
// lever written in them (the blow's base 2, SHOP_PREMIUM 2) is listed by hand. SQL catalogues are listed by hand too: --check proves each
// named SQL anchor still exists, never that no new SQL constant appeared.
//
// Exit: 0 ran / clean · 1 a --check problem or a --selftest proof failed · 2 a bad argument.
// mutant-anchors: none — --selftest plants on an in-memory file map and in-memory rows; no tracked file is patched
// ci-step: economy-selftests | Balance lever registry - an unclaimed typed number, a new key in a pinned table, a lost anchor and a bad knob are each caught
// ci-run: node tools/mutant-gate.mjs node tools/balance-program/levers.mjs --selftest
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isMain } from '../../tests/_is-main.mjs';
import { bindingsOf, readRuleFiles, RULE_FOLDERS } from './census.mjs';
import { SCRATCH_TREES } from './matrix-scratch.mjs';
import { LEVERS, NOT_LEVERS, CATEGORIES, CLASSES, GAPS, PERTURB_KINDS } from './levers/index.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
export const SCHEMA = 'hearthrise.balance-levers/1';
export const LEVERS_FILE = 'tools/balance-program/levers.json';
export const DOC_FILE = 'docs/design/balance-baseline/02-lever-registry.md';
const KNOBS_FILE = 'tools/balance-program/formulas/knobs.json';
const ARCH_FILE = 'tools/balance-program/formulas/formulas-architecture.json';
const PATCH_DIR = 'tools/balance-program/patches';
/* the files a matrix patch can edit: the fixture's plant (src/core, src/data, src/build-info.js) and matrix-scratch.mjs SCRATCH_TREES */
export const PATCHABLE = Object.freeze(['src/core', 'src/data', 'src/build-info.js', ...SCRATCH_TREES]);
/* binding names too common to mean a test reads this lever */
const GENERIC_NAMES = new Set(['default', 'validate', 'row', 'rows', '<statements>', 'round', 'round5', 'lines', 'said', 'priced', 'hours', 'pct', 'fmtPct', 'shape', 'json', 'sql', 'MIN', 'KEEP', 'KINDS', 'EVAL', 'NAMED', 'TIERS', 'METRICS', 'FACTS', 'CHEST']);

const lf = (s) => s.replace(/\r\n/g, '\n');
const slash = (p) => p.split('\\').join('/');
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
/** A home or not-a-lever pattern: `file#name`, `*` one path segment or name part, `**` any depth. */
export const patternRe = (p) => new RegExp('^' + p.split('**').map((a) => a.split('*').map((b) => b.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/#]*')).join('.*') + '$');
const wordRe = (w) => new RegExp('(?<![\\w$])' + w.replace(/[$]/g, '\\$') + '(?![\\w$])');
const countOf = (text, needle) => { let n = 0, i = -1; while ((i = text.indexOf(needle, i + 1)) >= 0) n++; return n; };
const inTrees = (file, trees) => trees.some((t) => file === t || file.startsWith(t + '/'));

/* ── THE BINDING SPANS: bindingsOf gives a start line; a site needs the binding its line sits in ─────────────────────────────── */
function withEnds(rows, text) {
  const n = text.split('\n').length;
  const sorted = rows.slice().sort((a, b) => a.line - b.line);
  return sorted.map((r, i) => ({ ...r, end: i + 1 < sorted.length ? sorted[i + 1].line - 1 : n }));
}

/**
 * THE MODEL. `ctx`: { files: [[path, text]] (the rule code), read(file) -> text | null (any tracked file), knobs (knobs.json), patches
 * ([[name, patch]]), tests ([[path, text]]), edges ([[from, to]]), levers, notLevers, pins (the stored pins, or null) }. Pure: the selftest
 * plants every argument. Answers { levers (resolved rows), bindings, claims, pins, problems, census }.
 */
export function buildModel(ctx) {
  const problems = [];
  const bad = (kind, what) => problems.push({ kind, what });
  const bindings = [];
  for (const [file, text] of ctx.files) bindings.push(...withEnds(bindingsOf(file, lf(text)), lf(text)));
  const key = (b) => b.file + '#' + b.name;
  const knobIds = new Set((ctx.knobs.knobs || []).map((k) => k.id));
  const plannedIds = new Set((ctx.knobs.planned || []).map((k) => k.id));
  const knobFiles = new Map((ctx.knobs.knobs || []).map((k) => [k.id, new Set(k.sites.map((s) => s.file))]));
  const ruleFile = (f) => RULE_FOLDERS.some((d) => f.startsWith(d + '/'));
  const homes = new Map(); // pattern -> { pin, levers: Set }
  const addHome = (pattern, pin, id) => {
    const h = homes.get(pattern) || { pin, levers: new Set() };
    if (h.pin !== pin) bad('home', pattern + ' is pinned two ways (' + h.pin + ' and ' + pin + ' by ' + id + ')');
    h.levers.add(id); homes.set(pattern, h);
  };
  /* reach: every formula downstream of a formula in the architecture graph */
  const out = new Map();
  for (const [a, b] of ctx.edges || []) { if (!out.has(a)) out.set(a, new Set()); out.get(a).add(b); }
  const reachOf = (ids) => { const seen = new Set(); const stack = [...ids]; while (stack.length) { const x = stack.pop(); for (const y of out.get(x) || []) if (!seen.has(y)) { seen.add(y); stack.push(y); } } for (const i of ids) seen.delete(i); return seen.size; };
  const patchesOf = (sites) => (ctx.patches || []).filter(([, p]) => (p.edits || []).some((e) => sites.some((s) => s.text && e.from.includes(s.text.trim())))).map(([n]) => n);
  const knobPatches = (knob) => (ctx.patches || []).filter(([, p]) => p.knobs && Object.prototype.hasOwnProperty.call(p.knobs, knob)).map(([n]) => n);

  const ids = new Set();
  const levers = [];
  for (const L of ctx.levers) {
    if (ids.has(L.id)) bad('lever', L.id + ' is listed twice');
    ids.add(L.id);
    if (!CATEGORIES[L.cat]) bad('lever', L.id + ': no category ' + L.cat);
    if (!CLASSES[L.cls]) bad('lever', L.id + ': no class ' + L.cls);
    const sites = [];
    for (const s of L.at || []) {
      const text = ctx.read(s.file);
      if (text === null) { bad('anchor', L.id + ': ' + s.file + ' is not in the tree'); continue; }
      const lines = lf(text).split('\n');
      const hits = [];
      lines.forEach((t, i) => { if (t.includes(s.anchor)) hits.push(i + 1); });
      const want = s.count || 1;
      if (hits.length !== want) { bad('anchor', L.id + ': ' + s.file + ' has ' + hits.length + ' line(s) holding ' + JSON.stringify(s.anchor) + ', the row names ' + want); continue; }
      const occ = countOf(lf(text), s.anchor);
      for (const line of hits) {
        const b = ruleFile(s.file) ? bindings.find((x) => x.file === s.file && x.line <= line && line <= x.end && x.kind !== 'statements') : null;
        sites.push({ file: s.file, line, text: lines[line - 1].trim(), binding: b ? b.name : null, patchable: want === 1 && occ === 1 && inTrees(s.file, PATCHABLE) });
        if (b) addHome(key(b), s.pin || (b.kind === 'function' ? 'count' : 'count'), L.id);
      }
    }
    for (const h of (L.rows && L.rows.homes) || []) addHome(h.at, h.pin || 'keys', L.id);
    /* the eighth field */
    const p = L.perturb || {};
    if (!PERTURB_KINDS.includes(p.kind)) bad('perturb', L.id + ': perturb kind ' + p.kind + ' is not one of ' + PERTURB_KINDS.join(', '));
    if (p.kind === 'knob') {
      if (!knobIds.has(p.knob)) bad('perturb', L.id + ': knob ' + p.knob + (plannedIds.has(p.knob) ? ' is PLANNED in knobs.json, not live: not playable yet' : ' is not in knobs.json'));
      else if (sites.length && !sites.some((s) => knobFiles.get(p.knob).has(s.file))) bad('perturb', L.id + ': knob ' + p.knob + ' moves no file this lever sits in');
    }
    if (p.kind === 'patch') {
      if (!sites.length) bad('perturb', L.id + ': a patch needs a site to edit');
      for (const s of sites) if (!s.patchable) bad('perturb', L.id + ': ' + s.file + ':' + s.line + ' cannot be a patch edit (the anchor is not one exact text in a planted file)');
    }
    if (p.kind === 'not-playable' && !GAPS[p.gap]) bad('perturb', L.id + ': gap ' + p.gap + ' is not one of ' + Object.keys(GAPS).join(', '));
    if (p.planned && !plannedIds.has(p.planned)) bad('perturb', L.id + ': planned knob ' + p.planned + ' is not in knobs.json planned');
    /* the seventh field: an authored assert must name a test that exists and reads one of the lever's names */
    const names = [...new Set([...sites.map((s) => s.binding).filter(Boolean), ...((L.rows && L.rows.names) || []), ...(L.names || [])])].filter((n) => !GENERIC_NAMES.has(n));
    const asserts = [];
    for (const [file, what] of L.tests || []) {
      const t = (ctx.tests || []).find(([f]) => f === file);
      if (!t) { bad('test', L.id + ': ' + file + ' is not a test file'); continue; }
      const reads = (L.testReads || names).filter((n) => wordRe(n).test(t[1]));
      if (!reads.length) bad('test', L.id + ': ' + file + ' reads none of ' + (L.testReads || names).join(', '));
      asserts.push({ file, what, reads });
    }
    const mentions = names.length ? (ctx.tests || []).filter(([f, t]) => names.some((n) => wordRe(n).test(t))).map(([f]) => f).sort() : [];
    const f = L.f || [];
    levers.push({
      id: L.id, category: L.cat, name: L.name,
      sites: sites.map(({ patchable, ...s }) => s),
      definition: L.def, range: L.range, touches: L.touches, outcomes: L.out || [], formulas: f, reach: reachOf(f),
      class: L.cls, change: L.change || changeOf(L.at || []),
      tests: { asserts, mentions: mentions.slice(0, 8), mentionCount: mentions.length, verdict: asserts.length ? 'asserted' : mentions.length ? 'mentioned only' : 'none' },
      perturb: { ...p, ...(p.kind === 'patch' && sites.length ? { from: sites.map((s) => s.file + ': ' + s.text) } : {}),
        existingPatches: [...new Set([...patchesOf(sites), ...(p.knob ? knobPatches(p.knob) : [])])].sort() },
      ...(L.rows ? { rows: { what: L.rows.what, homes: L.rows.homes.map((h) => h.at) } } : {}),
      flags: L.flags || [], evidence: L.ev || '',
    });
  }
  /* claims: every binding that holds a typed number */
  const notRes = (ctx.notLevers || []).map((n) => ({ ...n, re: patternRe(n.at) }));
  const homeRes = [...homes].map(([pattern, h]) => ({ pattern, ...h, re: patternRe(pattern) }));
  const claims = { lever: 0, notLever: 0, unclaimed: [] };
  for (const b of bindings) {
    const k = key(b);
    if (homeRes.some((h) => h.re.test(k))) claims.lever++;
    else if (notRes.some((n) => n.re.test(k))) claims.notLever++;
    else { claims.unclaimed.push(k); bad('unclaimed', k + ':' + b.line + ' holds ' + b.typed.length + ' typed number(s) [' + b.typed.slice(0, 6).join(' ') + (b.typed.length > 6 ? ' ...' : '') + '] and no lever row or NOT_LEVERS reason claims it'); }
  }
  for (const n of notRes) if (!bindings.some((b) => n.re.test(key(b)))) bad('stale', 'NOT_LEVERS ' + n.at + ' matches no binding that holds a typed number');
  /* pins */
  const pins = {};
  for (const h of homeRes) {
    const mine = bindings.filter((b) => h.re.test(key(b)));
    if (!mine.length) { bad('home', h.pattern + ' (' + [...h.levers].join(', ') + ') matches no binding that holds a typed number'); continue; }
    const keys = [...new Set(mine.flatMap((b) => b.keys))].sort();
    pins[h.pattern] = h.pin === 'open' ? { pin: 'open', bindings: mine.length } : h.pin === 'keys' ? { pin: 'keys', keys, bindings: mine.length } : { pin: 'count', keys, typed: mine.reduce((a, b) => a + b.typed.length, 0), bindings: mine.length };
  }
  if (ctx.pins) {
    for (const [pattern, now] of Object.entries(pins)) {
      const was = ctx.pins[pattern];
      if (!was) { bad('pin', pattern + ' has no pin in ' + LEVERS_FILE + ': run --write'); continue; }
      if (now.pin !== 'open') {
        const added = now.keys.filter((k) => !was.keys.includes(k));
        if (added.length) bad('pin', pattern + ' holds a number under a NEW key (' + added.join(', ') + '): a new lever or a new field. Name it in a lever row, then --write');
      }
      if (now.pin === 'count' && now.typed > was.typed) bad('pin', pattern + ' holds ' + now.typed + ' typed numbers, the registry was written at ' + was.typed + ': name the new one in a lever row, then --write');
    }
  }
  const census = { bindings: bindings.length, typed: bindings.reduce((a, b) => a + b.typed.length, 0), files: new Set(bindings.map((b) => b.file)).size, ...claims, unclaimed: claims.unclaimed.length };
  return { levers, pins, problems, census, homes: homeRes.length };
}

/* field 6: what a change takes, from where the lever lives */
export function changeOf(at) {
  const kinds = new Set(at.map((s) => (s.file.startsWith('supabase/migrations/') ? 'sql' : s.file.startsWith('src/data/') ? 'data' : 'code')));
  if (kinds.has('sql') && kinds.size === 1) return 'SQL: a new migration (the server decides; no JS reads it)';
  if (kinds.has('data') && kinds.size === 1) return 'data: a row or constant in src/data (its generated SQL catalogue, if any, is re-run by its generator)';
  if (kinds.has('code') && kinds.size === 1) return 'code: a typed number in engine code';
  return 'mixed: ' + [...kinds].join(' and ');
}

/* ── THE TREE ────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const walk = (dir, out = []) => { if (!existsSync(dir)) return out; for (const n of readdirSync(dir).sort()) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(m?js|json)$/.test(n)) out.push(p); } return out; };
function treeCtx(root, pins) {
  const read = (f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : null);
  const knobs = JSON.parse(read(KNOBS_FILE));
  const arch = JSON.parse(read(ARCH_FILE));
  const patches = walk(join(root, PATCH_DIR)).filter((p) => p.endsWith('.json')).map((p) => [slash(relative(root, p)), JSON.parse(readFileSync(p, 'utf8'))]);
  const tests = walk(join(root, 'tests')).filter((p) => /\.m?js$/.test(p)).map((p) => [slash(relative(root, p)), readFileSync(p, 'utf8')]);
  return { files: readRuleFiles(root), read, knobs, patches, tests, edges: arch.edges.map((e) => [e.from, e.to]), levers: LEVERS, notLevers: NOT_LEVERS, pins };
}

/* ROWS: what a content lever's table holds today (an import of the game's own module; never in the selftest) */
async function measureRows(root, levers, src) {
  const cache = new Map();
  const load = (f) => { if (!cache.has(f)) cache.set(f, import(pathToFileURL(join(root, f)).href)); return cache.get(f); };
  for (const L of levers) {
    const R = src.find((x) => x.id === L.id).rows;
    if (!R || !R.measure) continue;
    try { L.rows.today = await R.measure(load); } catch (e) { L.rows.today = { error: String(e.message).split('\n')[0] }; }
  }
}

/* LIVE: the same anchor on origin/main (BL-1's baseline is the live game) */
function liveColumn(root, levers) {
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  let commit;
  try { commit = git(['rev-parse', 'origin/main']).trim(); } catch { return { ref: 'origin/main', commit: null }; }
  const files = new Map();
  const show = (f) => { if (!files.has(f)) { try { files.set(f, lf(git(['show', 'origin/main:' + f]))); } catch { files.set(f, null); } } return files.get(f); };
  for (const L of levers) {
    const src = LEVERS.find((x) => x.id === L.id);
    const main = [];
    for (const s of src.at || []) {
      const text = show(s.file);
      if (text === null) { main.push({ file: s.file, text: null, note: 'not on main' }); continue; }
      const hits = text.split('\n').filter((t) => t.includes(s.anchor)).map((t) => t.trim());
      main.push({ file: s.file, text: hits.length ? hits.join(' | ') : null, note: hits.length ? null : 'the anchor is not on main' });
    }
    const here = L.sites.map((s) => s.text).join(' | ');
    const there = main.map((m) => m.text).join(' | ');
    L.live = { same: here === there, ...(here === there ? {} : { main }) };
  }
  return { ref: 'origin/main', commit };
}

/* the fields a person writes: the registry is stale when they move and --write was not run */
const authoredHash = (levers, notLevers) => sha(JSON.stringify([levers.map(({ rows, ...L }) => ({ ...L, rows: rows ? { what: rows.what, homes: rows.homes } : null })), notLevers]));

async function write(root) {
  const ctx = treeCtx(root, null);
  const m = buildModel(ctx);
  await measureRows(root, m.levers, LEVERS);
  const live = liveColumn(root, m.levers);
  let head = null;
  try { head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { /* a copy with no git */ }
  const doc = {
    schema: SCHEMA, generatedBy: 'tools/balance-program/levers.mjs --write', tree: head, live,
    authored: authoredHash(LEVERS, NOT_LEVERS),
    fields: FIELDS, categories: CATEGORIES, classes: CLASSES, perturbKinds: PERTURB_KINDS, gaps: GAPS,
    counts: countsOf(m), census: m.census, problems: m.problems,
    levers: m.levers,
    notLevers: NOT_LEVERS.map(({ at, why }) => ({ at, why })),
    pins: m.pins,
  };
  writeFileSync(join(root, LEVERS_FILE), JSON.stringify(doc, null, 1) + '\n');
  writeDoc(root, doc);
  return doc;
}

export const FIELDS = Object.freeze({
  sites: '1. where it lives: file, line, the source line, the binding (resolved from an anchor by --write)',
  definition: '2. its value or definition (the source line is the value as written today)',
  range: '3. valid range and constraints (validators, caps, rulings)',
  touches: '4. the systems and outcomes it moves (outcomes: balance-matrix METRICS ids where the matrix measures them; reach: formulas downstream in formulas-architecture.json)',
  class: '5. global coefficient, archetype parameter, content attribute, or an exception (intentional, or accidental per 44 class 4)',
  change: '6. data or config, code, or SQL',
  tests: '7. a test that asserts it (authored, checked to read the lever), and every test file that names its binding',
  perturb: '8. how the simulator perturbs it: a knobs.json knob, a patch edit balance-matrix.mjs can apply, a matrix cell variant, or NOT PLAYABLE with the gap',
});

export function countsOf(m) {
  const by = (f) => m.levers.reduce((o, L) => { const k = f(L); o[k] = (o[k] || 0) + 1; return o; }, {});
  return { levers: m.levers.length, byCategory: by((L) => L.category), byClass: by((L) => L.class), byPerturb: by((L) => (L.perturb.kind === 'not-playable' ? 'not-playable:' + L.perturb.gap : L.perturb.kind)),
    byTest: by((L) => L.tests.verdict), flags: m.levers.reduce((o, L) => { for (const f of L.flags) o[f.kind] = (o[f.kind] || 0) + 1; return o; }, {}) };
}

/* ── THE DOC'S GENERATED TABLES ─────────────────────────────────────────────────────────────────────────────────────────────── */
const mark = (k) => ['<!-- GENERATED:' + k + ' (tools/balance-program/levers.mjs --write) -->', '<!-- END GENERATED:' + k + ' -->'];
const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
export function docTables(doc) {
  const t = {};
  const c = doc.counts;
  const catRows = Object.entries(doc.categories).map(([k, label]) => {
    const mine = doc.levers.filter((L) => L.category === k);
    const cls = (x) => mine.filter((L) => L.class === x).length;
    const np = mine.filter((L) => L.perturb.kind === 'not-playable').length;
    return '| ' + label + ' | ' + mine.length + ' | ' + cls('global') + ' | ' + cls('archetype') + ' | ' + cls('content') + ' | ' + (cls('exception-intentional') + cls('exception-accidental')) + ' | ' + mine.filter((L) => L.perturb.kind === 'knob').length + ' | ' + np + ' | ' + mine.filter((L) => L.tests.verdict === 'asserted').length + ' |';
  });
  t.COUNTS = ['| Category | Levers | Global | Archetype | Content | Exception | On a knob | Not playable | A test asserts it |', '|---|---|---|---|---|---|---|---|---|', ...catRows,
    '| **All** | **' + c.levers + '** | ' + (c.byClass.global || 0) + ' | ' + (c.byClass.archetype || 0) + ' | ' + (c.byClass.content || 0) + ' | ' + ((c.byClass['exception-intentional'] || 0) + (c.byClass['exception-accidental'] || 0)) + ' | ' + (c.byPerturb.knob || 0) + ' | ' + Object.entries(c.byPerturb).filter(([k]) => k.startsWith('not-playable')).reduce((a, [, n]) => a + n, 0) + ' | ' + (c.byTest.asserted || 0) + ' |'].join('\n');
  t.CENSUS = ['| | Count |', '|---|---|', '| Top-level bindings in the rule code that hold a typed number | ' + doc.census.bindings + ' (in ' + doc.census.files + ' files, ' + doc.census.typed + ' typed numbers) |',
    '| Claimed by a lever | ' + doc.census.lever + ' |', '| Claimed by a not-a-lever reason | ' + doc.census.notLever + ' |', '| Unclaimed | ' + doc.census.unclaimed + ' |',
    '| Exceptions, intentional and accidental | ' + (c.byClass['exception-intentional'] || 0) + ' and ' + (c.byClass['exception-accidental'] || 0) + ' |',
    '| Levers whose line on the live game (origin/main ' + String(doc.live.commit || '').slice(0, 9) + ') differs | ' + doc.levers.filter((L) => L.live && !L.live.same).length + ' |'].join('\n');
  const flagRows = [];
  for (const kind of ['redundant', 'ineffective', 'contradictory']) for (const L of doc.levers) for (const f of L.flags.filter((x) => x.kind === kind)) flagRows.push('| ' + kind + ' | `' + L.id + '` ' + cell(L.name) + ' | ' + cell(f.why) + ' | ' + cell(f.ev) + ' |');
  t.FLAGS = ['| Kind | Lever | What | Evidence |', '|---|---|---|---|', ...flagRows].join('\n');
  const np = doc.levers.filter((L) => L.perturb.kind === 'not-playable').sort((a, b) => (a.perturb.gap < b.perturb.gap ? -1 : a.perturb.gap > b.perturb.gap ? 1 : a.id < b.id ? -1 : 1));
  t.NOT_PLAYABLE = ['| Gap | Lever | Category | Why |', '|---|---|---|---|', ...np.map((L) => '| ' + L.perturb.gap + ' | `' + L.id + '` ' + cell(L.name) + ' | ' + cell(doc.categories[L.category]) + ' | ' + cell(L.perturb.note || doc.gaps[L.perturb.gap]) + ' |')].join('\n');
  const top = doc.levers.slice().sort((a, b) => (b.reach - a.reach) || (b.outcomes.length - a.outcomes.length) || (a.id < b.id ? -1 : 1)).slice(0, 25);
  t.REACH = ['| Lever | Reach (formulas downstream) | Matrix outcomes it moves | Perturbed by | Class |', '|---|---|---|---|---|',
    ...top.map((L) => '| `' + L.id + '` ' + cell(L.name) + ' | ' + L.reach + ' | ' + L.outcomes.length + ' | ' + (L.perturb.kind === 'knob' ? 'knob `' + L.perturb.knob + '`' : L.perturb.kind === 'not-playable' ? 'NOT PLAYABLE (' + L.perturb.gap + ')' : L.perturb.kind) + ' | ' + L.class + ' |')].join('\n');
  const live = doc.levers.filter((L) => L.live && !L.live.same);
  t.LIVE = ['| Lever | On set (this registry) | On main (the live game) |', '|---|---|---|', ...live.map((L) => '| `' + L.id + '` | ' + cell(L.sites.map((s) => s.text).join(' / ').slice(0, 160)) + ' | ' + cell((L.live.main || []).map((x) => x.text || x.note).join(' / ').slice(0, 160)) + ' |')].join('\n');
  return t;
}
function writeDoc(root, doc) {
  const p = join(root, DOC_FILE);
  if (!existsSync(p)) return;
  let text = lf(readFileSync(p, 'utf8'));
  for (const [k, body] of Object.entries(docTables(doc))) {
    const [a, b] = mark(k);
    const i = text.indexOf(a), j = text.indexOf(b);
    if (i < 0 || j < 0) continue;
    text = text.slice(0, i + a.length) + '\n' + body + '\n' + text.slice(j);
  }
  writeFileSync(p, text);
}

/* ── THE REPORT AND THE CHECK ───────────────────────────────────────────────────────────────────────────────────────────────── */
function check(root, { strict }) {
  const stored = existsSync(join(root, LEVERS_FILE)) ? JSON.parse(readFileSync(join(root, LEVERS_FILE), 'utf8')) : null;
  const m = buildModel(treeCtx(root, stored ? stored.pins : null));
  const problems = m.problems.slice();
  if (!stored) problems.push({ kind: 'stale', what: LEVERS_FILE + ' is missing: run --write' });
  else {
    if (stored.schema !== SCHEMA) problems.push({ kind: 'stale', what: LEVERS_FILE + ' is ' + stored.schema + ', not ' + SCHEMA });
    if (stored.authored !== authoredHash(LEVERS, NOT_LEVERS)) problems.push({ kind: 'stale', what: 'the lever rows or NOT_LEVERS moved since ' + LEVERS_FILE + ' was written: run --write' });
  }
  /* drift is information, not a failure */
  let moved = 0, valued = 0;
  if (stored) for (const L of m.levers) {
    const was = stored.levers.find((x) => x.id === L.id);
    if (!was) continue;
    if (L.sites.map((s) => s.line).join() !== was.sites.map((s) => s.line).join()) moved++;
    if (L.sites.map((s) => s.text).join() !== was.sites.map((s) => s.text).join()) valued++;
  }
  console.log('levers: ' + m.levers.length + ' levers; ' + m.census.bindings + ' bindings hold a typed number (' + m.census.lever + ' claimed by a lever, ' + m.census.notLever + ' by a not-a-lever reason, ' + m.census.unclaimed + ' unclaimed)');
  if (stored) console.log('  since --write: ' + moved + ' lever(s) moved line, ' + valued + ' changed their source line (a value or its text). --write re-reads both' + (strict ? ' (--strict: a failure)' : ''));
  if (strict && (moved || valued)) problems.push({ kind: 'stale', what: moved + ' moved, ' + valued + ' changed since --write' });
  for (const p of problems) console.error('  ✗ [' + p.kind + '] ' + p.what);
  return problems.length ? 1 : 0;
}

/* ── THE PROOFS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
function selftest() {
  const fails = [];
  let proofs = 0;
  const ok = (c, what) => { proofs++; if (!c) fails.push(what); };
  const FILES = {
    'src/data/sheet.js': 'export const COEF = Object.freeze({ hp: 4.95, blow: 0.22 });\nexport const TABLE = Object.freeze({ wolf: { hp: 40, atk: 7 }, rat: { hp: 12, atk: 3 } });\n',
    'src/core/fight.js': 'export function blow(s) { return Math.floor(s * 0.35 + 7); }\n',
    'src/data/world/art.js': 'export const SPOTS = [[3, 4], [5, 6]];\n',
    'supabase/migrations/0001-fee.sql': 'create function hr_fee() returns int language sql as $$ select 150 $$; -- c_fee_bp\n',
  };
  const TEST = ['tests/sheet.mjs', 'import { COEF } from "../src/data/sheet.js"; assert(COEF.hp > 0);'];
  const KNOBS = { knobs: [{ id: 'monsterHp', sites: [{ file: 'src/data/sheet.js' }] }], planned: [{ id: 'skillPower' }] };
  const base = () => [
    { id: 'mon.hp', cat: 'monster-stats', cls: 'global', name: 'HP line', at: [{ file: 'src/data/sheet.js', anchor: 'export const COEF' }], perturb: { kind: 'knob', knob: 'monsterHp' }, tests: [TEST.slice(0, 1).concat('the line')] },
    { id: 'mon.rows', cat: 'monster-stats', cls: 'content', name: 'rows', rows: { what: 'hp, atk', homes: [{ at: 'src/data/sheet.js#TABLE', pin: 'keys' }] }, perturb: { kind: 'not-playable', gap: 'outside-hunt' } },
    { id: 'blow.skill', cat: 'base-damage', cls: 'global', name: 'skill term', at: [{ file: 'src/core/fight.js', anchor: 's * 0.35' }], perturb: { kind: 'patch' } },
    { id: 'econ.fee', cat: 'economy', cls: 'global', name: 'fee', at: [{ file: 'supabase/migrations/0001-fee.sql', anchor: 'c_fee_bp' }], perturb: { kind: 'not-playable', gap: 'sql-only' } },
  ];
  const NOT = [{ at: 'src/data/world/**', why: 'art layout' }];
  const run = (files, o = {}) => {
    const all = { ...FILES, ...files };
    const rule = Object.entries(all).filter(([f, t]) => t !== null && /^(src\/core|src\/data|supabase\/functions\/hr-accrue)\//.test(f));
    return buildModel({ files: rule, read: (f) => (all[f] == null ? null : all[f]), knobs: KNOBS, patches: [], tests: [TEST], edges: [], levers: o.levers || base(), notLevers: o.notLevers || NOT, pins: o.pins === undefined ? null : o.pins });
  };
  const has = (m, kind, bit) => m.problems.some((p) => p.kind === kind && p.what.includes(bit));
  const clean = run({});
  ok(clean.problems.length === 0, 'control: the planted tree is clean, got ' + JSON.stringify(clean.problems));
  ok(clean.census.bindings === 4 && clean.census.lever === 3 && clean.census.notLever === 1, 'control: four bindings, three claimed by levers, one by a reason');
  const pins = clean.pins;
  ok(pins['src/data/sheet.js#TABLE'] && pins['src/data/sheet.js#TABLE'].pin === 'keys' && pins['src/data/sheet.js#COEF'].typed === 2, 'control: a table pins its keys, a coefficient home its count');
  ok(run({}, { pins }).problems.length === 0, 'control: the tree against its own pins is clean');
  /* PLANT 1: a new binding with a typed number, no claim */
  ok(has(run({ 'src/core/fight.js': FILES['src/core/fight.js'] + 'export const HEAT = 1.012;\n' }), 'unclaimed', 'src/core/fight.js#HEAT'), 'an unclaimed typed number is caught');
  /* PLANT 2: a new typed number in a pinned coefficient home */
  ok(has(run({ 'src/data/sheet.js': FILES['src/data/sheet.js'].replace('blow: 0.22', 'blow: 0.22, gentleCap: 0.11') }, { pins }), 'pin', 'NEW key (gentleCap)'), 'a new key in a coefficient home is caught');
  ok(has(run({ 'src/core/fight.js': 'export function blow(s) { return Math.floor(s * 0.35 + 7) * 1.1; }\n' }, { pins }), 'pin', 'holds 3 typed numbers'), 'a new bare number in a function is caught');
  /* PLANT 3: a new field in a content table is caught, a new row with the same fields is not */
  ok(has(run({ 'src/data/sheet.js': FILES['src/data/sheet.js'].replace('rat: { hp: 12, atk: 3 }', 'rat: { hp: 12, atk: 3, dropBonus: 1.15 }') }, { pins }), 'pin', 'dropBonus'), 'a new numeric field in a content table is caught');
  ok(run({ 'src/data/sheet.js': FILES['src/data/sheet.js'].replace('rat: { hp: 12, atk: 3 }', 'rat: { hp: 12, atk: 3 }, bat: { hp: 9, atk: 4 }') }, { pins }).problems.length === 0, 'a new row with the same fields is no problem');
  /* PLANT 4: a value change is no problem */
  ok(run({ 'src/data/sheet.js': FILES['src/data/sheet.js'].replace('hp: 4.95', 'hp: 5.4'), 'src/core/fight.js': FILES['src/core/fight.js'].replace('0.35', '0.4') }, { pins: null, levers: base().map((L) => (L.id === 'blow.skill' ? { ...L, at: [{ file: 'src/core/fight.js', anchor: 's * 0.4' }] } : L)) }).problems.length === 0, 'a moved value is no problem');
  /* PLANT 5: a lost anchor */
  ok(has(run({ 'src/core/fight.js': 'export function blow(s) { return Math.floor(s * 0.4 + 7); }\n' }), 'anchor', 'blow.skill'), 'a lost anchor is caught');
  ok(has(run({ 'supabase/migrations/0001-fee.sql': 'select 1;\n' }), 'anchor', 'econ.fee'), 'a lost SQL anchor is caught');
  /* PLANT 6: a bad knob, a planned knob, a patch on an anchor that is not one exact text, a bad gap */
  ok(has(run({}, { levers: base().map((L) => (L.id === 'mon.hp' ? { ...L, perturb: { kind: 'knob', knob: 'nope' } } : L)) }), 'perturb', 'knob nope'), 'an unknown knob is caught');
  ok(has(run({}, { levers: base().map((L) => (L.id === 'mon.hp' ? { ...L, perturb: { kind: 'knob', knob: 'skillPower' } } : L)) }), 'perturb', 'PLANNED'), 'a planned knob is caught as not playable');
  ok(has(run({ 'src/core/fight.js': 'export function blow(s) { return Math.floor(s * 0.35 + 7); }\n// s * 0.35 again\n' }, { levers: base().map((L) => (L.id === 'blow.skill' ? { ...L, at: [{ file: 'src/core/fight.js', anchor: 's * 0.35', count: 2 }] } : L)) }), 'perturb', 'cannot be a patch'), 'a patch on a twice-written text is caught');
  ok(has(run({}, { levers: base().map((L) => (L.id === 'econ.fee' ? { ...L, perturb: { kind: 'not-playable', gap: 'later' } } : L)) }), 'perturb', 'gap later'), 'an unknown gap is caught');
  /* PLANT 7: a test that does not read the lever, a test that is not there */
  ok(has(run({}, { levers: base().map((L) => (L.id === 'mon.rows' ? { ...L, tests: [['tests/sheet.mjs', 'x']] } : L)) }), 'test', 'reads none of'), 'an authored test that reads none of the lever is caught');
  ok(has(run({}, { levers: base().map((L) => (L.id === 'mon.hp' ? { ...L, tests: [['tests/gone.mjs', 'x']] } : L)) }), 'test', 'not a test file'), 'a missing test file is caught');
  /* PLANT 8: a stale reason, a lever listed twice */
  ok(has(run({}, { notLevers: [...NOT, { at: 'src/data/gone.js#X', why: 'x' }] }), 'stale', 'gone.js'), 'a reason that matches nothing is caught');
  ok(has(run({}, { levers: [...base(), base()[0]] }), 'lever', 'listed twice'), 'a lever listed twice is caught');
  ok(patternRe('src/data/grounds/*/pack.js#default').test('src/data/grounds/hasks_ford/pack.js#default') && !patternRe('src/data/*.js#X').test('src/data/world/a.js#X'), 'a * is one segment, never a folder');
  for (const f of fails) console.error('  ✗ ' + f);
  console.log(fails.length ? 'levers --selftest: ' + fails.length + ' proof(s) FAILED' : 'levers --selftest: ' + proofs + ' proofs hold (unclaimed, new key, new number, new field, lost anchor, bad knob, bad patch, bad gap, bad test, stale reason; a new row and a moved value pass)');
  return fails.length ? 1 : 0;
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const known = ['--write', '--check', '--selftest', '--strict'];
  const badArg = argv.find((a) => !known.includes(a));
  if (badArg) { console.error('levers: unknown argument ' + badArg + ' (takes ' + known.join(', ') + ')'); process.exit(2); }
  if (argv.includes('--selftest')) process.exit(selftest());
  if (argv.includes('--write')) {
    const doc = await write(ROOT);
    console.log('levers --write: ' + doc.counts.levers + ' levers, ' + doc.census.bindings + ' bindings (' + doc.census.unclaimed + ' unclaimed), ' + doc.problems.length + ' problem(s); wrote ' + LEVERS_FILE);
    for (const p of doc.problems) console.error('  ✗ [' + p.kind + '] ' + p.what);
    process.exit(doc.problems.length ? 1 : 0);
  }
  const code = check(ROOT, { strict: argv.includes('--strict') });
  process.exit(argv.includes('--check') ? code : 0);
}
