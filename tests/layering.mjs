#!/usr/bin/env node
// tests/layering.mjs — IMPORTS POINT ONE WAY (architecture audit 2026-11-18, item 2; new rule 1).
//
//   node tests/layering.mjs              exit 1 on a new breach, a stale baseline entry or an unplaced folder
//   node tests/layering.mjs --for <file> the same, judged for one edited file (tools/hooks/edit-checks.mjs; ~0.1 s)
//   node tests/layering.mjs --report     the folder-to-folder edge counts and the baseline, gate too
//   node tests/layering.mjs --selftest   planted breaches on an in-memory copy of the tree must go red
//
// mutant-anchors: src/ supabase/functions/ tests/layering.baseline.json
// mutant-writes-tree: no — every --selftest mutant is planted into an in-memory copy of the tree; only --write writes, and only the baseline
//
// Every module under src/ belongs to the layer named by its first folder (src/build-info.js is `build`), and every
// file under supabase/functions/ is `edge`. A layer may import itself and the layers on its row, nothing else:
//
//   layer       may import                                              what it is
const ALLOWED = {
  data:        [],                                                    // rows and lookups, no rules; dual-runtime (the edge vendors it)
  core:        ['data'],                                              // the one engine; dual-runtime, vendored into the edge
  build:       [],                                                    // src/build-info.js, the version stamp
  vendor:      [],                                                    // third-party bundles, loaded by <script>; never scanned
  utils:       [],                                                    // client helpers with no game knowledge (escapeHtml)
  platform:    ['utils', 'build'],                                    // the browser seam: storage, https upgrade, SW kill-switch
  net:         ['data', 'core', 'utils', 'platform', 'build', 'vendor'], // the wire: Supabase client, auth, connection, telemetry
  render:      ['data', 'core', 'utils', 'platform', 'build'],        // paint, sprites and text for any view; holds no state
  session:     ['net', 'data', 'core', 'utils', 'platform', 'build'], // one CharacterSession per hero: intents out, envelope in
  'hunt-view': ['session', 'render', 'net', 'data', 'core', 'utils', 'platform', 'build'],
  world:       ['session', 'render', 'net', 'data', 'core', 'utils', 'platform', 'build'],
  social:      ['session', 'render', 'net', 'data', 'core', 'utils', 'platform', 'build'],
  shell:       ['hunt-view', 'world', 'social', 'session', 'render', 'net', 'data', 'core', 'utils', 'platform', 'build'],
  app:         ['shell', 'hunt-view', 'world', 'social', 'session', 'render', 'net', 'data', 'core', 'utils', 'platform', 'build', 'vendor'],
  edge:        ['core', 'data'],                                      // supabase/functions/**: the server runs only the dual-runtime layers
};
// So: data <- core <- session <- hunt-view | world | social <- shell <- app, with render beside session (neither imports
// the other: state does not depend on pixels), net under session, and the three view layers as peers that do not import
// each other. A folder not in the table is RED until it is placed: at ten times the content a new folder is a new layer.
//
// An import is a static `import`/`export … from`, a literal `import('…')`, or `new URL('…', import.meta.url)` (the form
// src/shell/windows/game-master.js uses to keep a module out of the preload list), read with comments blanked so a
// JSDoc `typeof import('…')` is not an edge.
//
// BASELINE (tests/layering.baseline.json): the file-to-file breaches on 2026-11-18. It only shrinks. A breach not on it
// is RED; an entry that no longer breaches (the import moved, or the file went) is RED as STALE until its line is
// deleted, so a fixed breach cannot quietly come back. `--write` prunes stale entries and never adds one.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import { strip } from './_js-strip.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'tests', 'layering.baseline.json');
const SCANNED = /\.(m?js|ts)$/;

/** The layer a repo-relative path belongs to, '?' for an unplaced src/ folder, null when it is not layered. */
export function layerOf(rel) {
  if (rel.startsWith('supabase/functions/')) return 'edge';
  if (!rel.startsWith('src/')) return null;
  const parts = rel.split('/');
  if (parts.length === 2) return rel === 'src/build-info.js' ? 'build' : '?';
  return Object.hasOwn(ALLOWED, parts[1]) ? parts[1] : '?';
}

const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\bnew\s+URL\s*\(\s*)(['"`])(\.{1,2}\/[^'"`]*?)\1/g;

/** The repo-relative files one module imports (relative specifiers only; `?v=` and `#` dropped). */
export function importsOf(rel, text) {
  const code = strip(text).noC;
  const out = [];
  for (const m of code.matchAll(SPEC)) {
    const target = posix.normalize(posix.join(posix.dirname(rel), m[2].replace(/[?#].*$/, '')));
    if (SCANNED.test(target)) out.push(target);
  }
  return out;
}

/** Every layered source as rel -> text (vendor is third-party and not scanned). */
export function readTree() {
  const files = new Map();
  const walk = (abs, rel) => {
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const r = rel + '/' + e.name;
      if (e.isDirectory()) { if (!e.name.startsWith('.') && e.name !== 'node_modules' && r !== 'src/vendor') walk(join(abs, e.name), r); }
      else if (SCANNED.test(e.name)) files.set(r, readFileSync(join(abs, e.name), 'utf8'));
    }
  };
  walk(join(ROOT, 'src'), 'src');
  if (existsSync(join(ROOT, 'supabase', 'functions'))) walk(join(ROOT, 'supabase', 'functions'), 'supabase/functions');
  return files;
}

export function readBaseline() {
  return existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).breaches || [] : [];
}

/** The breaches in `files` (rel -> text), judged against `baseline`; `only` limits the verdict to one importer. */
export function verdict(files, baseline, only = null) {
  const breaches = [];
  const unplaced = new Set();
  for (const [rel, text] of files) {
    if (only && rel !== only) continue;
    const from = layerOf(rel);
    if (from === null) continue;
    if (from === '?') { unplaced.add(rel.split('/').slice(0, 2).join('/')); continue; }
    for (const target of importsOf(rel, text)) {
      const to = layerOf(target);
      if (to === null || to === from) continue;
      if (to === '?') { unplaced.add(target.split('/').slice(0, 2).join('/')); continue; }
      if (!ALLOWED[from].includes(to)) breaches.push(`${rel} -> ${target}`);
    }
  }
  const found = new Set(breaches);
  const pinned = new Set(baseline);
  const fresh = [...found].filter((b) => !pinned.has(b)).sort();
  const stale = baseline.filter((b) => (!only || b.startsWith(only + ' -> ')) && !found.has(b)).sort();
  return { breaches: [...found].sort(), fresh, stale, unplaced: [...unplaced].sort() };
}

function explain(v) {
  const lines = [];
  for (const b of v.fresh) {
    const [from, to] = b.split(' -> ');
    lines.push(`LAYER-1 ${b}: ${layerOf(from)} may not import ${layerOf(to)} (allowed: ${ALLOWED[layerOf(from)].join(', ') || 'nothing'}).`
      + ' Move the shared piece down a layer or pass it in from above.');
  }
  for (const b of v.stale) lines.push(`LAYER-2 STALE baseline entry "${b}": that import no longer breaches. Delete its line from tests/layering.baseline.json (or run --write).`);
  for (const u of v.unplaced) lines.push(`LAYER-3 ${u} is not in the layer table at the top of tests/layering.mjs. Place it (one row: what it may import, what it is).`);
  return lines;
}

function report(files, v) {
  const counts = new Map();
  for (const [rel, text] of files) {
    const from = layerOf(rel);
    if (!from || from === '?') continue;
    for (const t of importsOf(rel, text)) {
      const to = layerOf(t);
      if (!to || to === from || to === '?') continue;
      const k = `${ALLOWED[from].includes(to) ? '   ' : 'BR '}${from} -> ${to}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  for (const [k, n] of [...counts].sort((a, b) => a[0].slice(3).localeCompare(b[0].slice(3)))) console.log(String(n).padStart(5) + '  ' + k);
  console.log(`\nbaseline: ${v.breaches.length - v.fresh.length} pinned breach(es) still present`);
  for (const b of v.breaches) console.log('  ' + b);
}

function selftest() {
  const tree = readTree();
  const baseline = readBaseline();
  const clean = verdict(tree, baseline);
  if (clean.fresh.length || clean.stale.length || clean.unplaced.length) {
    console.error('SELFTEST INCONCLUSIVE: the real tree is not green:\n  ' + explain(clean).join('\n  '));
    return 1;
  }
  const pick = (layer) => [...tree.keys()].find((r) => layerOf(r) === layer && !r.includes('/grounds/'));
  const plant = (rel, line) => new Map([...tree, [rel, line + '\n' + tree.get(rel)]]);
  const core = pick('core'), session = pick('session'), world = pick('world'), edge = 'supabase/functions/hr-accrue/index.ts';
  const cases = [
    { name: 'an upward static import (core -> shell)', files: plant(core, "import { x } from '../shell/app-shell.js?v=1';"), expect: 'LAYER-1' },
    { name: 'an upward dynamic import (session -> shell)', files: plant(session, "const m = import('../shell/app-shell.js?v=1');"), expect: 'LAYER-1' },
    { name: 'an upward new URL (session -> app)', files: plant(session, "const u = new URL('../app/boot.js?v=1', import.meta.url);"), expect: 'LAYER-1' },
    { name: 'a re-export upward (data -> render)', files: plant('src/data/items.js', "export { a } from '../render/format.js?v=1';"), expect: 'LAYER-1' },
    { name: 'a peer view import (world -> social)', files: plant(world, "import { y } from '../social/friends.js?v=1';"), expect: 'LAYER-1' },
    { name: 'the dual-runtime floor (core -> utils)', files: plant(core, "import { escapeHtml } from '../utils/dom.js?v=1';"), expect: 'LAYER-1' },
    { name: 'the edge reaching the client (edge -> session)', files: plant(edge, "import { z } from '../../../src/session/config.js';"), expect: 'LAYER-1' },
    { name: 'a stale baseline entry', files: tree, baseline: [...baseline, 'src/core/xp.js -> src/shell/app-shell.js'], expect: 'LAYER-2' },
    { name: 'a baseline entry whose import was fixed', files: (() => {
      const [from, to] = baseline[0].split(' -> ');
      const base = posix.basename(to);
      return new Map([...tree, [from, tree.get(from).split('\n').filter((l) => !(l.includes(base) && /from|import|URL/.test(l))).join('\n')]]);
    })(), expect: 'LAYER-2' },
    { name: 'an unplaced folder', files: new Map([...tree, ['src/gadgets/thing.js', "import { a } from '../core/xp.js?v=1';"]]), expect: 'LAYER-3' },
    { name: 'an import into an unplaced folder', files: plant(session, "import { a } from '../gadgets/thing.js?v=1';"), expect: 'LAYER-3' },
    { name: '--for still sees a new breach in the one file', files: plant(core, "import { x } from '../shell/app-shell.js?v=1';"), only: core, expect: 'LAYER-1' },
    // Controls: each must stay silent.
    { name: 'CONTROL a downward import (session -> core)', files: plant(session, "import { a } from '../core/xp.js?v=1';"), expect: null },
    { name: 'CONTROL a downward import (shell -> world)', files: plant(pick('shell'), "import { a } from '../world/atlas.js?v=1';"), expect: null },
    { name: 'CONTROL an upward import inside a comment', files: plant(core, "// import { x } from '../shell/app-shell.js?v=1';\n/** @type {typeof import('../app/boot.js')} */"), expect: null },
    { name: 'CONTROL a package specifier on the edge', files: plant(edge, "import postgres from 'npm:postgres@3.4.5';"), expect: null },
    { name: 'CONTROL --for on a file with no breach', files: plant(core, "import { x } from '../shell/app-shell.js?v=1';"), only: session, expect: null },
  ];
  let bad = 0;
  for (const c of cases) {
    const lines = explain(verdict(c.files, c.baseline || baseline, c.only || null));
    const hit = c.expect ? lines.some((l) => l.startsWith(c.expect)) : lines.length === 0;
    if (!hit) { bad++; console.error(`  MISSED  ${c.name}: expected ${c.expect || 'silence'}, got ${lines.length ? lines.join(' | ').slice(0, 300) : 'silence'}`); }
    else console.log(`  caught  ${c.name}${c.expect ? ' -> ' + c.expect : ' (silent)'}`);
  }
  if (bad) { console.error(`SELFTEST FAIL layering: ${bad} of ${cases.length} case(s) wrong.`); return 1; }
  console.log(`SELFTEST PASS layering: ${cases.length} cases (${cases.filter((c) => c.expect).length} planted, ${cases.filter((c) => !c.expect).length} controls).`);
  return 0;
}

function main(argv) {
  if (argv.includes('--selftest')) return selftest();
  const forAt = argv.indexOf('--for');
  if (forAt >= 0) {
    const rel = relative(ROOT, resolve(ROOT, argv[forAt + 1] || '')).replace(/\\/g, '/');
    if (layerOf(rel) === null || !SCANNED.test(rel) || rel.startsWith('src/vendor/') || !existsSync(join(ROOT, rel))) return 0;
    const lines = explain(verdict(new Map([[rel, readFileSync(join(ROOT, rel), 'utf8')]]), readBaseline(), rel));
    if (lines.length) { console.error('FAIL layering (' + rel + '):\n  ' + lines.join('\n  ')); return 1; }
    return 0;
  }
  const tree = readTree();
  const baseline = readBaseline();
  const v = verdict(tree, baseline);
  if (argv.includes('--report')) report(tree, v);
  if (argv.includes('--write')) {
    if (v.fresh.length) { console.error('--write never adds a breach. Fix these instead:\n  ' + v.fresh.join('\n  ')); return 1; }
    const doc = JSON.parse(readFileSync(BASELINE, 'utf8'));
    doc.breaches = baseline.filter((b) => !v.stale.includes(b));
    writeFileSync(BASELINE, JSON.stringify(doc, null, 2) + '\n');
    console.log(`layering: baseline pruned ${v.stale.length} stale entr(ies), ${doc.breaches.length} left.`);
    return 0;
  }
  const lines = explain(v);
  if (lines.length) { console.error(`FAIL layering: ${lines.length} problem(s).\n  ` + lines.join('\n  ')); return 1; }
  console.log(`PASS layering: ${tree.size} modules, ${v.breaches.length} pinned breach(es) left on the baseline, none new.`);
  return 0;
}

if (isMain(import.meta.url)) process.exit(main(process.argv.slice(2)));
