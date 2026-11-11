#!/usr/bin/env node
// tests/imports-resolve.mjs — EVERY NAME A MODULE USES IS DECLARED OR IMPORTED, AND EVERY IMPORT RESOLVES.
//
// WHY THIS EXISTS (2026-11-11, the v0.2.122 chain merges). A git merge of two branches that both edited an import
// block dropped names the body still used: `bigPullParts` and `patchParts` in src/shell/windows/hunt-detail.js and
// `t` in src/shell/windows/party-roster.js, three times in one chain. `node --check` parses it fine (an undeclared
// name is a runtime ReferenceError, not a syntax error), the typecheck ratchet's baseline absorbs a new TS2304 as
// one more count, and dead-exports only reads exports. Only a browser test that opened the window found it.
//
// WHAT IT CHECKS, over every .js module under src/** (not src/vendor/**), read by the TypeScript parser and binder
// the repo already pins (typescript 6.0.3), through the same `?v=`-stripping resolver as tools/typecheck.mjs:
//   (a) an identifier used in a module that is not declared in scope, not a parameter, not imported, and not a global
//       the runtime provides (the DOM + ES lib, plus RUNTIME_GLOBALS below for Deno/Node/vendor);
//   (b) an import / re-export whose specifier resolves to no file;
//   (c) a named import (or re-export) the target module does not export.
// Nothing is ratcheted: the tree must have zero findings.
//
//   node tests/imports-resolve.mjs             exit 1 with file:line per finding
//   node tests/imports-resolve.mjs --selftest  plants the real faults on an overlay, each must be caught,
//                                              and the clean tree must be green
//
// NO ?v= on the imports (tests/**, not a browser module).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import { stripQuery } from '../tools/typecheck.mjs';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));

/* Globals the runtime hands a module that lib.dom / lib.es2023 do not declare. Every entry needs a reason. */
const RUNTIME_GLOBALS = new Set([
  'Deno',      // the dual-runtime modules under src/core and src/data are imported by the Edge function
  'process',   // the same modules read process.env behind a typeof guard
  'Sentry', 'posthog', 'supabase', // src/vendor UMD builds, loaded by <script> on the root pages
]);

/* TS codes: 2304/2552 cannot find name, 2307 cannot find module, 2305/2724/2614 no exported member, 2306 not a module,
   2503 cannot find namespace, 2459/2460 declared locally but not exported. */
const WANTED = new Set([2304, 2552, 2307, 2305, 2724, 2614, 2306, 2503, 2459, 2460, 2661]);
const posix = (p) => relative(ROOT, p).split(sep).join('/');

function listFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (!(posix(p) + '/').startsWith('src/vendor/')) walk(p); }
      else if (e.name.endsWith('.js')) out.push(p);
    }
  };
  walk(join(ROOT, 'src'));
  return out.sort();
}

/* Ranges of every JSDoc block: a `@param x { a, b }` in prose is parsed as a type, and its words are not code. */
function jsdocRanges(ts, sf) {
  const r = [];
  const walk = (n) => { for (const d of n.jsDoc || []) r.push([d.pos, d.end]); ts.forEachChild(n, walk); };
  walk(sf);
  return r;
}

export async function findings(overlay = {}) {
  const ts = (await import('typescript')).default;
  const options = {
    allowJs: true, checkJs: true, noEmit: true, skipLibCheck: true, types: [], strict: false, noImplicitAny: false,
    target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'], maxNodeModuleJsDepth: 0,
  };
  const host = ts.createCompilerHost(options, true);
  host.getCurrentDirectory = () => ROOT;
  const cache = ts.createModuleResolutionCache(ROOT, (f) => f, options);
  host.resolveModuleNameLiterals = (literals, containingFile, redirected, opts, sf) => literals.map((lit) => {
    const mode = ts.getModeForUsageLocation(sf, lit, opts);
    return ts.resolveModuleName(stripQuery(lit.text), containingFile, opts, host, cache, redirected, mode);
  });
  const planted = new Map(Object.entries(overlay).map(([rel, text]) => [normalize(join(ROOT, rel)), text]));
  if (planted.size) {
    const { readFile, fileExists, getSourceFile } = host;
    const at = (f) => planted.get(normalize(f));
    host.readFile = (f) => at(f) ?? readFile.call(host, f);
    host.fileExists = (f) => at(f) !== undefined || fileExists.call(host, f);
    host.getSourceFile = (f, lang, ...rest) => (at(f) !== undefined ? ts.createSourceFile(f, at(f), lang, true) : getSourceFile.call(host, f, lang, ...rest));
  }
  const program = ts.createProgram({ rootNames: listFiles(), options, host });
  const out = [];
  for (const sf of program.getSourceFiles()) {
    const rel = posix(sf.fileName);
    if (!rel.startsWith('src/') || rel.startsWith('src/vendor/')) continue;
    let docs = null;
    for (const d of program.getSemanticDiagnostics(sf)) {
      if (!WANTED.has(d.code) || d.start === undefined) continue;
      docs ??= jsdocRanges(ts, sf);
      if (docs.some(([a, b]) => d.start >= a && d.start < b)) continue;
      const msg = ts.flattenDiagnosticMessageText(d.messageText, ' ');
      const name = /^Cannot find name '([^']+)'/.exec(msg)?.[1];
      if (name && RUNTIME_GLOBALS.has(name)) continue;
      const { line } = sf.getLineAndCharacterOfPosition(d.start);
      out.push(`${rel}:${line + 1}  ${msg}`);
    }
  }
  return out;
}

async function selftest() {
  const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
  const bad = [];
  const clean = await findings();
  if (clean.length) bad.push(`clean tree is not green (${clean.length} findings, first: ${clean[0]})`);
  const drop = (src, name) => {
    const lines = src.split('\n');
    const i = lines.findIndex((l) => /^\s*import\b/.test(l) && new RegExp(`[{,\\s]${name}\\b`).test(l));
    if (i < 0) throw new Error(`selftest anchor gone: no import of ${name}`);
    lines[i] = lines[i].replace(new RegExp(`\\b${name}\\b\\s*,?\\s*`), '');
    return lines.join('\n');
  };
  const cases = [
    ['hunt-detail.js loses bigPullLine (the bigPullParts shape)', 'src/shell/windows/hunt-detail.js', (s) => drop(s, 'bigPullLine'), /bigPullLine/],
    ['hunt-detail.js loses materialsOf (the patchParts shape)', 'src/shell/windows/hunt-detail.js', (s) => drop(s, 'materialsOf'), /materialsOf/],
    ['party-roster.js loses huntName (the t shape)', 'src/shell/windows/party-roster.js', (s) => drop(s, 'huntName'), /huntName/],
    ['import of a missing file', 'src/shell/windows/party-roster.js', (s) => `import { x } from './no-such-module.js?v=0.0.0';\nexport const _p = x;\n${s}`, /Cannot find module/],
    ['import of a name the target does not export', 'src/shell/windows/party-roster.js', (s) => `import { noSuchExport } from './hunt-detail.js?v=0.0.0';\nexport const _q = noSuchExport;\n${s}`, /no exported member|has no exported/],
  ];
  for (const [label, rel, mutate, want] of cases) {
    let text;
    try { text = mutate(read(rel)); } catch (e) { bad.push(`${label}: ${e.message}`); continue; }
    const hits = (await findings({ [rel]: text })).filter((f) => f.startsWith(rel + ':'));
    if (!hits.some((h) => want.test(h))) bad.push(`${label}: NOT CAUGHT (got ${hits.length} findings in the file)`);
    else console.log(`  caught: ${label}`);
  }
  if (bad.length) { console.error('imports-resolve --selftest RED:\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log('imports-resolve --selftest: every planted fault caught, clean tree green');
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) await selftest();
  else {
    const t0 = Date.now();
    const f = await findings();
    if (f.length) {
      console.error(`imports-resolve: ${f.length} unresolved name(s) or import(s):\n  ` + f.join('\n  '));
      console.error('A name a module uses must be declared or imported (a merge dropped it), and every import must resolve to a file that exports it.');
      process.exit(1);
    }
    console.log(`imports-resolve: green (${listFiles().length} modules, ${Date.now() - t0} ms)`);
  }
}
