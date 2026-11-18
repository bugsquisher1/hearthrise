#!/usr/bin/env node
// tests/dead-exports.mjs — DEAD EXPORTS AND ORPHAN FILES, judged by what the game runs (cleanup slice 3; tightened by
// the architecture audit 2026-11-18, item 3 and new rule 7: "alive" means a consumer in src/ or the edge).
//
//   node tests/dead-exports.mjs             exit 1 on a new dead export, a new orphan file or a stale baseline entry
//   node tests/dead-exports.mjs --report    the census: dead exports, orphan files, and what the baseline still pins
//   node tests/dead-exports.mjs --write     prune stale baseline entries (never adds one)
//   node tests/dead-exports.mjs --selftest  mutation proof on an in-memory tree
//
// mutant-anchors: src/ supabase/functions/ tests/dead-exports.baseline.json
// mutant-writes-tree: no — every --selftest mutant is planted into an in-memory copy of the tree; only --write writes, and only the baseline
//
// WHY IT WAS TIGHTENED. The first census (2026-09-06) counted any mention anywhere in the repo as reach: a test, a doc,
// an SQL comment, and it exempted every file under src/core and src/data because the edge vendors them. It passed while
// the tightened census found 122 exports and 12 files nothing in the game used (v0.2.137). A test that calls a function
// is not a reason to ship it; it is a second thing to delete.
//
// WHAT RUNS (the production graph). Walked from the roots below along relative imports (static, `import('…')`,
// `new URL('…', import.meta.url)`), `<script src>` on the root pages, and string literals that are exactly a repo path
// (`'src/vendor/…js'`, the generated preload list). Comments are blanked before reading, so a JSDoc
// `typeof import('…')` is not an edge.
//   roots: every *.html at the repo root · supabase/functions/*/index.ts (the edge) · ENTRY_TOOLS below
// An ORPHAN is a src/**/*.js file the walk never reaches.
//
// DEAD EXPORT. An exported name (`export function|class|const|let|var NAME`, `export { NAME }`) in a reached src file
// is dead when nothing reached uses it:
//   (a) no other reached file (src, the edge, an entry tool, a root page; comments blanked) has the token NAME;
//   (b) no reached file has the string 'NAME' (string-keyed dispatch, window['NAME']);
//   (c) no other reached file has an identifier that CONTAINS NAME (`window.__recordItemTrade` reached a function a
//       \b search called dead, 2026-09-06; an alias counts as reach);
//   (d) no reached file reads a namespace import of its file whole (`Object.keys(ns)`, passing `ns` on); and
//   (e) its own file never uses it past the declaration (a decoration `NAME.patch = …` is not a use). A name used in
//       its own file is live code with a needless `export`, not dead code, and is not counted.
// Names shorter than three characters are noise and skipped.
//
// BASELINE (tests/dead-exports.baseline.json): what the tightened census found, minus what this lane cut. It only
// shrinks. A dead export or orphan not on it is RED; an entry that is alive again, or gone, is RED as STALE until its
// line is deleted (--write prunes). The edge's own dead paths (the worker, rested and away imports in accrual.js) are
// alive by this definition because the edge imports them: cutting those is an engine lane, not this guard.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import { strip } from './_js-strip.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'tests', 'dead-exports.baseline.json');

/* Tools that turn src/ into something we ship (the site, the server catalogues, the art, Tyler's Balance Lab). Their
   imports are consumers; a test's are not. Each needs a reason: a tool that only inspects or simulates (qa, probes, the
   coverage bot, balance-sim) is a test by another name. A row that keeps nothing alive is dropped, not kept for show. */
export const ENTRY_TOOLS = [
  ['tools/build-site.mjs', 'builds the published site (.github/workflows/pages.yml): the art constants it reads decide which files ship'],
  ['tools/gen-*.mjs', 'write the server catalogues (SQL migrations) from src/data rows, the drift-guarded second home of game data'],
  ['tools/world-art/*.mjs', 'build the world atlases and art manifests under src/data/world and assets/ that the client loads'],
  ['tools/balance-lab/build.mjs', "builds Tyler's Balance Lab artifact: the real engine under the designer's dials"],
];

const JS = /\.(m?js|ts)$/;
const SKIP_DIR = new Set(['node_modules', '.git', 'out', 'dist', 'build']);

/** Every file the census can read, rel -> raw text: src/, supabase/functions/, tools/, and the root pages. */
export function readTree() {
  const files = new Map();
  const walk = (abs, rel) => {
    let ents;
    try { ents = readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name.startsWith('.') || SKIP_DIR.has(e.name)) continue;
      const r = rel + '/' + e.name;
      if (e.isDirectory()) walk(join(abs, e.name), r);
      else if (JS.test(e.name) || e.name.endsWith('.html')) files.set(r, readFileSync(join(abs, e.name), 'utf8'));
    }
  };
  walk(join(ROOT, 'src'), 'src');
  walk(join(ROOT, 'supabase', 'functions'), 'supabase/functions');
  walk(join(ROOT, 'tools'), 'tools');
  for (const e of readdirSync(ROOT)) if (e.endsWith('.html')) files.set(e, readFileSync(join(ROOT, e), 'utf8'));
  return files;
}

const isVendor = (rel) => rel.startsWith('src/vendor/');
const globRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');

/** A file's text as the census reads it: comments blanked (strings kept) for code, raw for a page, empty for vendor. */
function codeOf(rel, text) {
  if (isVendor(rel)) return '';
  return rel.endsWith('.html') ? text : strip(text).noC;
}

const SPEC = /(?:\bfrom\s*|\bimport\s*\(?\s*|\bnew\s+URL\s*\(\s*)(['"`])(\.{1,2}\/[^'"`]*?)\1/g;
const PATH_LIT = /(['"`])((?:src|supabase\/functions|tools)\/[\w./-]+\.m?js)(?:\?[^'"`]*)?\1/g;
const SCRIPT_SRC = /<script\b[^>]*\bsrc\s*=\s*["']([^"'?#]+)/g;

function edgesOf(rel, code) {
  const out = [];
  if (rel.endsWith('.html')) {
    for (const m of code.matchAll(SCRIPT_SRC)) out.push(posix.normalize(m[1]));
    return out;
  }
  for (const m of code.matchAll(SPEC)) out.push(posix.normalize(posix.join(posix.dirname(rel), m[2].replace(/[?#].*$/, ''))));
  for (const m of code.matchAll(PATH_LIT)) out.push(posix.normalize(m[2]));
  return out;
}

/** The production graph: the set of reached files, from the roots. */
export function reached(files, codes) {
  const tools = ENTRY_TOOLS.map(([g]) => globRe(g));
  const roots = [...files.keys()].filter((r) => !r.includes('/') && r.endsWith('.html')
    || /^supabase\/functions\/[^/]+\/index\.ts$/.test(r)
    || tools.some((re) => re.test(r)));
  const seen = new Set(roots);
  const queue = [...roots];
  while (queue.length) {
    const rel = queue.pop();
    for (const t of edgesOf(rel, codes.get(rel) || '')) {
      if (!seen.has(t) && files.has(t)) { seen.add(t); queue.push(t); }
    }
  }
  return seen;
}

const EXPORT_DECL = /^\s*export\s+(?:async\s+)?(?:function\s*\*?|class|const|let|var)\s*([A-Za-z_$][\w$]*)/;
const EXPORT_LIST = /^\s*export\s*\{([^}]*)\}\s*(?:;|$)/;

function declaredExports(rel, code) {
  const out = [];
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = EXPORT_DECL.exec(lines[i]);
    if (m) { out.push({ name: m[1], line: i + 1 }); continue; }
    const l = EXPORT_LIST.exec(lines[i]);
    if (l) {
      for (const part of l[1].split(',')) {
        const [local, as] = part.trim().split(/\s+as\s+/);
        const name = (as || local || '').trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name) && name !== 'default') out.push({ name, line: i + 1, list: true, aliased: !!as && as.trim() !== local.trim() });
      }
    }
  }
  return out;
}

/* The word-run index (guard diet, 2026-10-10): for a \w-only name, `\bNAME\b` matches exactly the runs equal to NAME
   and an alias exactly the runs that contain it, so the files a name can touch are read off the index. */
function wordIndex(codes) {
  const byRun = new Map();
  for (const [rel, code] of codes) {
    for (const run of new Set(code.match(/[\w$]+/g) || [])) {
      let s = byRun.get(run);
      if (!s) byRun.set(run, (s = new Set()));
      s.add(rel);
    }
  }
  const runs = [...byRun.keys()];
  const tri = new Map();
  runs.forEach((run, i) => {
    const seen = new Set();
    for (let k = 0; k + 3 <= run.length; k++) {
      const g = run.slice(k, k + 3);
      if (seen.has(g)) continue;
      seen.add(g);
      let l = tri.get(g);
      if (!l) tri.set(g, (l = []));
      l.push(i);
    }
  });
  return { byRun, runs, tri };
}

/** rel -> { exact: count of runs equal to NAME, alias: true when a longer run contains it }, over the index. */
function hitsOf(name, { byRun, runs, tri }) {
  let best = null;
  for (let k = 0; k + 3 <= name.length; k++) {
    const l = tri.get(name.slice(k, k + 3)) || [];
    if (!best || l.length < best.length) best = l;
  }
  const out = new Map();
  for (const i of best || []) {
    const run = runs[i];
    if (!run.includes(name)) continue;
    for (const rel of byRun.get(run)) {
      const h = out.get(rel) || { exact: false, alias: false };
      if (run === name) h.exact = true; else h.alias = true;
      out.set(rel, h);
    }
  }
  return out;
}

/* A namespace import read whole: `import * as ns from './x.js'` where `ns` appears other than as `ns.` — every export of
   x.js is then reachable by a name the census cannot see. */
function wholeNamespaceTargets(rel, code) {
  const out = [];
  for (const m of code.matchAll(/\bimport\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from\s*(['"`])(\.{1,2}\/[^'"`]*?)\2/g)) {
    const ns = m[1];
    const uses = code.match(new RegExp('\\b' + ns.replace(/\$/g, '\\$') + '\\b(?!\\s*\\.)', 'g')) || [];
    if (uses.length > 1) out.push(posix.normalize(posix.join(posix.dirname(rel), m[3].replace(/[?#].*$/, ''))));
  }
  return out;
}

/** The census over a tree (rel -> raw text): { reachedSet, orphans, dead, exports }. */
export function census(files) {
  const codes = new Map();
  for (const [rel, text] of files) codes.set(rel, codeOf(rel, text));
  const live = reached(files, codes);
  const orphans = [...files.keys()].filter((r) => r.startsWith('src/') && /\.m?js$/.test(r) && !live.has(r)).sort();
  const liveCodes = new Map([...codes].filter(([r]) => live.has(r)));
  const index = wordIndex(liveCodes);
  const wholeNs = new Set([...liveCodes].flatMap(([r, c]) => wholeNamespaceTargets(r, c)));
  const dead = [];
  let exportsSeen = 0;
  for (const [rel, code] of liveCodes) {
    if (!rel.startsWith('src/') || isVendor(rel) || !/\.m?js$/.test(rel) || wholeNs.has(rel)) continue;
    const decls = declaredExports(rel, code);
    exportsSeen += decls.length;
    for (const d of decls) {
      if (d.name.length < 3) continue;
      if (decls.some((o) => o !== d && o.name === d.name && o.line < d.line)) continue;
      const hits = hitsOf(d.name, index);
      const esc = d.name.replace(/\$/g, '\\$');
      const count = (re) => (code.match(re) || []).length;
      // (a) + (c): a token or an alias in another reached file.
      let alive = [...hits.keys()].some((r) => r !== rel);
      // (b): the quoted name in any reached file, its own included.
      if (!alive) alive = [...hits.keys()].some((r) => new RegExp('[\'"`]' + esc + '[\'"`]').test(liveCodes.get(r)));
      // (e): a use in its own file past the declaration, the export list and `NAME.prop = …` decorations.
      if (!alive) {
        const all = count(new RegExp('(?<![\\w$])' + esc + '(?![\\w$])', 'g'));
        const decor = count(new RegExp('(?<![\\w$.])' + esc + '\\s*\\.\\s*[\\w$]+\\s*=(?![=>])', 'g'));
        const listed = count(new RegExp('^\\s*export\\s*\\{[^}]*(?<![\\w$])' + esc + '(?![\\w$])[^}]*\\}\\s*(?:;|$)', 'gm'));
        const declared = decls.some((o) => o.name === d.name && !o.aliased) ? 1 : 0;
        alive = all - decor - listed - declared > 0;
      }
      if (!alive) dead.push(`${rel} ${d.name}`);
    }
  }
  return { reachedSet: live, orphans, dead: dead.sort(), exportsSeen };
}

export function readBaseline() {
  if (!existsSync(BASELINE)) return { exports: [], orphans: [] };
  const doc = JSON.parse(readFileSync(BASELINE, 'utf8'));
  return { exports: doc.exports || [], orphans: doc.orphans || [] };
}

export function verdict(c, baseline) {
  const pinE = new Set(baseline.exports);
  const pinO = new Set(baseline.orphans);
  const deadSet = new Set(c.dead);
  const orphanSet = new Set(c.orphans);
  return {
    freshExports: c.dead.filter((e) => !pinE.has(e)),
    freshOrphans: c.orphans.filter((o) => !pinO.has(o)),
    staleExports: baseline.exports.filter((e) => !deadSet.has(e)),
    staleOrphans: baseline.orphans.filter((o) => !orphanSet.has(o)),
  };
}

function explain(v) {
  const lines = [];
  for (const e of v.freshExports) {
    const [file, name] = e.split(' ');
    lines.push(`DEAD-1 ${file}: export ${name} has no consumer in src/, the edge, an entry tool or a root page. Delete it (and its tests), or give it a consumer.`);
  }
  for (const o of v.freshOrphans) lines.push(`DEAD-2 ${o}: nothing the game runs imports this file. Delete it, or import it from what runs.`);
  for (const e of v.staleExports) lines.push(`DEAD-3 STALE baseline export "${e}": it is alive again or gone. Delete its line from tests/dead-exports.baseline.json (or run --write).`);
  for (const o of v.staleOrphans) lines.push(`DEAD-3 STALE baseline orphan "${o}": it is reached again or gone. Delete its line from tests/dead-exports.baseline.json (or run --write).`);
  return lines;
}

function selftest() {
  const tree = readTree();
  const baseline = readBaseline();
  const clean = explain(verdict(census(tree), baseline));
  if (clean.length) { console.error('SELFTEST INCONCLUSIVE: the real tree is not green:\n  ' + clean.slice(0, 8).join('\n  ')); return 1; }
  /* Names are ASSEMBLED, never one literal: tools/ is in the corpus only through ENTRY_TOOLS, but a spelled-out probe
     name in a reached file would count as its consumer, the trap the first self-test fell into. */
  const P = 'hrDeadProbe' + 'Xyzzy';
  const Q = '?v' + '=1'; // assembled: a literal cache-buster in a tests/ import string is versionQueryGuard's to refuse
  const live = 'src/core/xp.js';
  const with_ = (rel, extra, base = tree) => new Map([...base, [rel, (base.get(rel) || '') + '\n' + extra + '\n']]);
  const cases = [
    { name: 'a new exported function nothing calls', files: with_(live, `export function ${P}1() { return 1; }`), expect: 'DEAD-1' },
    { name: 'a new export only a test calls', files: with_('tests/xp-probe.mjs', `import { ${P}2 } from '../src/core/xp.js'; ${P}2();`, with_(live, `export const ${P}2 = 2;`)), expect: 'DEAD-1' },
    { name: 'a new export only a doc names', files: with_('docs/probe.md', `${P}3 is live`, with_(live, `export function ${P}3() {}`)), expect: 'DEAD-1' },
    { name: 'a new export only a comment in src names', files: with_('src/session/server.js', `// see ${P}4 in xp.js`, with_(live, `export function ${P}4() {}`)), expect: 'DEAD-1' },
    { name: 'a new export used only by an orphan file', files: with_('src/core/__probe-orphan.js', `import { ${P}5 } from './xp.js'; ${P}5();`, with_(live, `export function ${P}5() {}`)), expect: 'DEAD-1' },
    { name: 'a new export in an edge-vendored file (no exemption)', files: with_('src/data/items.js', `export const ${P}6 = [];`), expect: 'DEAD-1' },
    { name: 'a new orphan file', files: with_('src/core/__probe-orphan.js', `export function ${P}7() {}`), expect: 'DEAD-2' },
    { name: 'a file reached only from a test is an orphan', files: with_('tests/probe.mjs', `import '../src/core/__probe-orphan.js';`, with_('src/core/__probe-orphan.js', `export const x = 1;`)), expect: 'DEAD-2' },
    { name: 'a stale baseline export', files: tree, baseline: { ...baseline, exports: [...baseline.exports, `src/core/xp.js ${P}8`] }, expect: 'DEAD-3' },
    { name: 'a stale baseline orphan', files: tree, baseline: { ...baseline, orphans: [...baseline.orphans, 'src/core/__gone.js'] }, expect: 'DEAD-3' },
    { name: 'a baseline export the client starts using', files: (() => {
      const [file, name] = baseline.exports[0].split(' ');
      return with_('src/session/server.js', `import { ${name} } from '${posix.relative('src/session', file)}${Q}'; ${name}();`);
    })(), expect: 'DEAD-3' },
    { name: 'a baseline orphan the client starts importing', files: with_('src/session/server.js', `import '${posix.relative('src/session', baseline.orphans[0])}${Q}';`), expect: 'DEAD-3' },
    // Controls: each must stay silent.
    { name: 'CONTROL an export read through a whole namespace', files: with_('src/session/server.js', `import * as ns from '../core/__probe-ns.js${Q}'; Object.keys(ns);`, with_('src/core/__probe-ns.js', `export function ${P}15() {}`)), expect: null },
    { name: 'CONTROL an export the client imports', files: with_('src/session/server.js', `import { ${P}9 } from '../core/xp.js${Q}'; ${P}9();`, with_(live, `export function ${P}9() {}`)), expect: null },
    { name: 'CONTROL an export only the edge imports', files: with_('supabase/functions/hr-accrue/index.ts', `import { ${P}10 } from '../../../src/core/xp.js'; ${P}10();`, with_(live, `export function ${P}10() {}`)), expect: null },
    { name: 'CONTROL an export only a generator imports', files: with_('tools/gen-probe.mjs', `import { ${P}11 } from '../src/core/xp.js'; ${P}11();`, with_(live, `export const ${P}11 = 1;`)), expect: null },
    { name: 'CONTROL an export reached by string key', files: with_('src/session/server.js', `const k = '${P}12';`, with_(live, `export function ${P}12() {}`)), expect: null },
    { name: 'CONTROL an export reached by alias', files: with_('src/session/server.js', `window.__${P}13();`, with_(live, `export function ${P}13() {}`)), expect: null },
    { name: 'CONTROL an export its own file uses', files: with_(live, `export function ${P}14() {}\nconst z = ${P}14();`), expect: null },
    { name: 'CONTROL a new file the client imports', files: with_('src/session/server.js', `import { y } from '../core/__probe-live.js${Q}'; y();`, with_('src/core/__probe-live.js', 'export const y = () => 1;')), expect: null },
  ];
  let bad = 0;
  for (const c of cases) {
    const lines = explain(verdict(census(c.files), c.baseline || baseline));
    const hit = c.expect ? lines.some((l) => l.startsWith(c.expect)) : lines.length === 0;
    if (!hit) { bad++; console.error(`  MISSED  ${c.name}: expected ${c.expect || 'silence'}, got ${lines.length ? lines.join(' | ').slice(0, 300) : 'silence'}`); }
    else console.log(`  caught  ${c.name}${c.expect ? ' -> ' + c.expect : ' (silent)'}`);
  }
  if (bad) { console.error(`SELFTEST FAIL dead-exports: ${bad} of ${cases.length} case(s) wrong.`); return 1; }
  console.log(`SELFTEST PASS dead-exports: ${cases.length} cases (${cases.filter((c) => c.expect).length} planted, ${cases.filter((c) => !c.expect).length} controls).`);
  return 0;
}

function main(argv) {
  if (argv.includes('--selftest')) return selftest();
  const tree = readTree();
  const c = census(tree);
  const baseline = readBaseline();
  const v = verdict(c, baseline);
  if (argv.includes('--report')) {
    console.log(`reached ${c.reachedSet.size} files from ${ENTRY_TOOLS.length} entry-tool pattern(s), the root pages and the edge; ${c.exportsSeen} exports read`);
    console.log(`\nORPHAN FILES (${c.orphans.length}):`);
    for (const o of c.orphans) console.log('  ' + o);
    console.log(`\nDEAD EXPORTS (${c.dead.length}):`);
    for (const e of c.dead) console.log('  ' + e);
  }
  if (argv.includes('--write')) {
    if (v.freshExports.length || v.freshOrphans.length) {
      console.error('--write never adds an entry. Cut these instead:\n  ' + [...v.freshExports, ...v.freshOrphans].join('\n  '));
      return 1;
    }
    const doc = JSON.parse(readFileSync(BASELINE, 'utf8'));
    doc.exports = baseline.exports.filter((e) => !v.staleExports.includes(e));
    doc.orphans = baseline.orphans.filter((o) => !v.staleOrphans.includes(o));
    writeFileSync(BASELINE, JSON.stringify(doc, null, 2) + '\n');
    console.log(`dead-exports: baseline pruned to ${doc.exports.length} export(s), ${doc.orphans.length} orphan file(s).`);
    return 0;
  }
  const lines = explain(v);
  if (lines.length) {
    console.error(`FAIL dead-exports: ${lines.length} problem(s).\n  ` + lines.join('\n  '));
    return 1;
  }
  console.log(`PASS dead-exports: ${c.exportsSeen} exports in ${c.reachedSet.size} reached files; ${c.dead.length} dead export(s) and ${c.orphans.length} orphan file(s) left on the baseline, none new.`);
  return 0;
}

if (isMain(import.meta.url)) process.exit(main(process.argv.slice(2)));
