#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/module-preload.mjs — THE CLIENT PAGE FETCHES EVERY MODULE AT ONCE.
//
//   node tests/module-preload.mjs             the guard
//   node tests/module-preload.mjs --write     regenerate play.html's block (after adding or dropping an import)
//   node tests/module-preload.mjs --selftest  planted defects must go RED, the clean page GREEN
//
// mutant-anchors: none — the proof edits in-memory copies of play.html and the module map, never the tree
//
// The browser finds an ES module only when its importer has arrived and been
// parsed, so the client's ~300 modules came in one import level at a time: on
// 10-23 eight levels cost 1.61 s of a cold boot (live v0.2.38 in the pane: the
// module graph done 6.9 s after navigation). play.html names every module the
// page loads in one generated block of <link rel="modulepreload">, so all of
// them are asked for while the HTML is parsed. A preload is fetched, never run
// early: evaluation order stays the import graph's.
//   MP-1  the block lists exactly the modules the page loads: the static graph
//         of the entry (src/app/boot.js), plus every literal dynamic import()
//         and ITS graph (the World pane's runtime, src/world/world-boot.js)
//   MP-2  each at the build's cache-buster (a different ?v= is another module
//         key: a second fetch, the preload wasted)
//   MP-3  non-vacuity: the entry is found in play.html and its graph is deep
//         (a reader that stopped at the first level would pass MP-1 vacuously)
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = 'play.html';
const BEGIN = '<!-- MODULE PRELOAD';
const END = '<!-- /MODULE PRELOAD -->';
const HEAD = BEGIN + ' (generated: node tests/module-preload.mjs --write). Every module the page loads, asked for at once\n'
  + '     while this page is parsed instead of one import level at a time; fetched, never run early. -->';
const MIN_MODULES = 100;   // MP-3: the rebuilt client is ~300 modules

/* Line-start import/export statements with a `from` (multi-line named lists included), bare
   side-effect imports, and literal dynamic import(): relative specifiers only. */
const STATIC_RE = /^[ \t]*(?:import|export)\b[^;'"]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/gm;
const BARE_RE = /^[ \t]*import\s*['"](\.{1,2}\/[^'"]+)['"]/gm;
const DYNAMIC_RE = /\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

/** The repo-relative modules `file` imports (static and literal dynamic), resolved, queries stripped. */
export function importsOf(file, src) {
  const out = [];
  for (const re of [STATIC_RE, BARE_RE, DYNAMIC_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) out.push(posix.normalize(posix.join(posix.dirname(file), m[1].split('?')[0])));
  }
  return out;
}

/** Every module reachable from `entry` through `read(file) → source`: a sorted list, the entry first. */
export function graphOf(entry, read) {
  const seen = new Set([entry]), queue = [entry];
  while (queue.length) {
    const f = queue.shift();
    for (const d of importsOf(f, read(f))) if (!seen.has(d)) { seen.add(d); queue.push(d); }
  }
  return [entry, ...Array.from(seen).filter((f) => f !== entry).sort()];
}

/** The entry module play.html runs: its one <script type="module" src>. */
export function entryOf(html) {
  const m = /<script type="module" src="([^"?]+)(?:\?v=[^"]*)?"><\/script>/.exec(html);
  return m ? m[1] : null;
}

/** The generated block for `modules` (every one but the entry, which the page's own tag loads) at `version`. */
export function blockFor(modules, version) {
  return HEAD + '\n' + modules.slice(1).map((f) => '<link rel="modulepreload" href="' + f + '?v=' + version + '">').join('\n') + '\n' + END;
}

/** Problems with `html`'s block against the graph (`read`) at `version`; [] when it holds. */
export function check(html, read, version) {
  const problems = [];
  const entry = entryOf(html);
  if (!entry) return ['MP-3 no <script type="module"> entry in ' + PAGE];
  const graph = graphOf(entry, read);
  const depth = (() => { let d = 0, level = [entry]; const seen = new Set(level); while (level.length) { d++; level = level.flatMap((f) => importsOf(f, read(f))).filter((x) => !seen.has(x) && seen.add(x)); } return d; })();
  if (graph.length < MIN_MODULES || depth < 4) problems.push('MP-3 the graph from ' + entry + ' is ' + graph.length + ' modules over ' + depth + ' levels: the reader is not following imports');
  const a = html.indexOf(BEGIN), b = html.indexOf(END);
  if (a < 0 || b < a) return problems.concat(['MP-1 ' + PAGE + ' has no MODULE PRELOAD block: run node tests/module-preload.mjs --write']);
  const listed = new Map();
  for (const m of html.slice(a, b).matchAll(/<link rel="modulepreload" href="([^"?]+)\?v=([^"]*)">/g)) listed.set(m[1], m[2]);
  const want = new Set(graph.slice(1));
  const missing = [...want].filter((f) => !listed.has(f)), stale = [...listed.keys()].filter((f) => !want.has(f));
  if (missing.length || stale.length) {
    problems.push('MP-1 the preload block is not the module graph (' + [missing.length ? 'missing ' + missing.slice(0, 4).join(', ') + (missing.length > 4 ? ' +' + (missing.length - 4) : '') : '',
      stale.length ? 'not loaded ' + stale.slice(0, 4).join(', ') : ''].filter(Boolean).join('; ') + '): run node tests/module-preload.mjs --write');
  }
  const off = [...listed].filter(([, v]) => v !== version);
  if (off.length) problems.push('MP-2 ' + off.length + ' preload(s) not at ?v=' + version + ': ' + off.slice(0, 3).map(([f, v]) => f + '?v=' + v).join(', '));
  return problems;
}

const readFile = (f) => {
  const p = join(ROOT, f);
  if (!existsSync(p)) throw new Error(f + ' is imported but does not exist');
  return readFileSync(p, 'utf8');
};
const versionOf = () => (/cache:\s*'([^']+)'/.exec(readFile('src/build-info.js')) || [])[1];

if (process.argv.includes('--write')) {
  const html = readFile(PAGE), version = versionOf();
  /* the page's own line endings (a Windows checkout writes CRLF): never a file of mixed endings */
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const block = blockFor(graphOf(entryOf(html), readFile), version).split('\n').join(eol);
  const a = html.indexOf(BEGIN), b = html.indexOf(END);
  const next = a >= 0 && b > a ? html.slice(0, a) + block + html.slice(b + END.length) : html.replace('</head>', block + eol + '</head>');
  writeFileSync(join(ROOT, PAGE), next);
  console.log('module-preload --write: ' + (next.match(/rel="modulepreload"/g) || []).length + ' modules in ' + PAGE + ' at ?v=' + version);
  process.exit(0);
}

if (process.argv.includes('--selftest')) {
  const html = readFile(PAGE), version = versionOf();
  const graph = graphOf(entryOf(html), readFile);
  const deep = graph[graph.length - 1];
  const extra = 'src/app/never-imported.js';
  const OTHER = ['0', '0', '1'].join('.');   // another build's cache-buster
  const cases = [
    ['the shipped page', html, readFile, null],
    ['a module the graph gained, not listed', html, (f) => (f === 'src/app/boot.js' ? readFile(f) + "\nimport { x } from './never-listed.js?v=" + version + "';\n" : f === 'src/app/never-listed.js' ? '' : readFile(f)), 'MP-1'],
    /* the page's own line endings (a Windows checkout is CRLF): the planted edit lands either way */
    ['a module dropped from the block', html.replace(new RegExp('<link rel="modulepreload" href="' + deep.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '\\?v=[^"]*">\\r?\\n'), ''), readFile, 'MP-1'],
    ['a module listed that nothing loads', html.replace(END, '<link rel="modulepreload" href="' + extra + '?v=' + version + '">\n' + END), readFile, 'MP-1'],
    ['a preload at another version', html.replace('href="' + deep + '?v=' + version + '"', 'href="' + deep + '?v=' + OTHER + '"'), readFile, 'MP-2'],
    ['the block deleted', html.slice(0, html.indexOf(BEGIN)) + html.slice(html.indexOf(END) + END.length), readFile, 'MP-1'],
    ['a multi-line import list the reader must follow', html, (f) => (f === 'src/app/boot.js' ? readFile(f) + "\nexport {\n  y,\n} from './never-listed.js?v=" + version + "';\n" : f === 'src/app/never-listed.js' ? '' : readFile(f)), 'MP-1'],
    ['the dynamic import not followed (the World pane)', html, (f) => (f === 'src/app/world-pane.js' ? readFile(f).replace(/import\('\.\.\/world\/world-boot\.js\?v=[^']*'\)/, "import(name)") : readFile(f)), 'MP-1'],
    ['a reader that stops at the first level', html, (f) => (f === 'src/app/boot.js' ? readFile(f) : ''), 'MP-3'],
  ];
  let bad = 0;
  for (const [name, h, read, want] of cases) {
    if (want !== null && h === html && read === readFile) { console.log('✗ ' + name + ' → HARNESS: the planted edit changed nothing'); bad++; continue; }
    const got = check(h, read, version);
    const ok = want === null ? got.length === 0 : got.some((g) => g.startsWith(want));
    if (!ok) bad++;
    console.log(`${ok ? '✓' : '✗'} ${name} → ${got[0] || 'GREEN'} (want ${want || 'GREEN'})`);
  }
  if (bad) { console.error(`✗ module-preload --selftest: ${bad} case(s) wrong`); process.exit(1); }
  console.log('✓ module-preload --selftest: all ' + cases.length + ' cases behave');
  process.exit(0);
}

const html = readFile(PAGE);
const problems = check(html, readFile, versionOf());
for (const p of problems) console.error('✗ ' + p);
if (problems.length) process.exit(1);
console.log('✓ module-preload: ' + PAGE + ' preloads all ' + (html.match(/rel="modulepreload"/g) || []).length + ' modules of its graph at ?v=' + versionOf());
