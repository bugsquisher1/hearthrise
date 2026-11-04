#!/usr/bin/env node
// tools/typecheck.mjs — TYPE CHECK AND BUG-CLASS LINT OVER src/**, WITH NO BUILD STEP IN THE GAME.
//
//   node tools/typecheck.mjs                    counts by error kind and by folder
//   node tools/typecheck.mjs --list [CODE]      every error (only CODE, e.g. 2339 or lint/no-undef)
//   node tools/typecheck.mjs --file src/x.js    every error in one file
//   node tools/typecheck.mjs --opt NAME         turn one more compiler option on, to measure it (repeatable)
//   node tools/typecheck.mjs --coverage         how much of the code the checker can actually see
//   node tools/typecheck.mjs --lint-if-installed   the lint alone, for the edit hook
//
// tests/typecheck-ratchet.mjs is the guard on top of this; this file only measures.
//
// WHY THE COMPILER API AND NOT `tsc --checkJs`: every import under src/** carries `?v=X.Y.Z` (CLAUDE.md §5), which
// tsc cannot resolve. The host below resolves the path with the query taken off, so nothing in src/** changes, the game
// still ships as plain JS, and it goes on working when the query is retired (tools/retire-version-queries.mjs).
//
// WHY typescript 6.0.3 AND NOT 7: 7 is the native port, with no createProgram to give a resolution host to. Once `?v=`
// is gone, 7's own `tsc` can do this job with no host at all, and much faster.
//
// WHY oxlint: one package and one platform binary, no dependency tree (ESLint has 30 direct dependencies, each one more
// package `npm install` runs in CI) and under a second over src/**. tools/lint-bugs.oxlintrc.json names its bug classes
// one by one, so a new release of it cannot add a rule to the gate.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../tests/_is-main.mjs';

const REPO = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const LINT_CONFIG = join(REPO, 'tools', 'lint-bugs.oxlintrc.json');
const AMBIENT = join(REPO, 'tools', 'typecheck', 'ambient.d.ts');

/* What is checked: src/vendor is third-party and pinned by hash; supabase/functions stays out for now. */
const SKIP_PREFIXES = ['src/vendor/'];

/* The strictness the ratchet holds; every other option is measured on the priority board (2026-11-04) and left off:
   strictNullChecks +230, noImplicitReturns +33, noUnusedLocals +15, noUnusedParameters +80, strictFunctionTypes +2,
   useUnknownInCatchVariables +8. None of those found a bug. */
function baseOptions(ts) {
  return {
    allowJs: true, checkJs: true, noEmit: true, skipLibCheck: true, resolveJsonModule: true, types: [],
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    /* `strict` is on by default from typescript 6: said out loud, and only the family members that earn it turned back on */
    strict: false,
    allowUnreachableCode: false, allowUnusedLabels: false,
    noFallthroughCasesInSwitch: true, noImplicitThis: true, strictBindCallApply: true,
    /* FOR ITS OTHER HALF. With this off, an object literal in a .js file is open: a wrong field on what a function returns reads
       `any`, with no error. Renaming 18 fields the session's readers return was caught 1 time in 18 with it off, 11 with it on.
       The errors it adds on its own account (10,044 "annotate this") are not bugs and never reach the ratchet: isAnnotationOnly. */
    noImplicitAny: true,
    maxNodeModuleJsDepth: 0,
  };
}

/* TS7xxx is "annotate this", but for the three real bug classes that share the number range; and a JSDoc `{object}` is what this
   code writes for "some object, ask no questions" (any, with noImplicitAny off), so a field read on one is no finding either. */
const BUG_7XXX = new Set([7027, 7028, 7029]);   // unreachable code, an unused label, a case falling through
const isAnnotationOnly = (code, message) => (code >= 7000 && code < 8000 && !BUG_7XXX.has(code)) || message.includes("type 'object'");

/** `./x.js?v=0.2.87` -> `./x.js`; a path with no query comes back unchanged. */
export const stripQuery = (spec) => spec.split('?')[0];

const posix = (root, p) => relative(root, p).split(sep).join('/');

function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js') && !SKIP_PREFIXES.some((pre) => posix(root, p).startsWith(pre))) out.push(p);
    }
  };
  if (existsSync(join(root, 'src'))) walk(join(root, 'src'));
  return out.sort();
}

/* The compiler is loaded on first use, so a caller that only needs compare() needs no install. */
async function loadTs() {
  try { return (await import('typescript')).default; } catch (e) { throw new Error('typescript is not installed here: run npm install (' + e.message + ')'); }
}

/**
 * The whole program, read through the query-stripping host.
 * @param {{ root?: string, options?: Record<string, unknown>, overlay?: Record<string, string> }} o
 *        overlay: { 'src/x.js': text } stands in for a file on disk, so a proof can plant a defect without touching the tree
 */
async function buildProgram({ root = REPO, options = {}, overlay = {} }) {
  const ts = await loadTs();
  const compilerOptions = { ...baseOptions(ts), ...options };
  const host = ts.createCompilerHost(compilerOptions, true);
  host.getCurrentDirectory = () => root;
  const cache = ts.createModuleResolutionCache(root, (f) => f, compilerOptions);
  host.resolveModuleNameLiterals = (literals, containingFile, redirected, opts, sourceFile) => literals.map((lit) => {
    const mode = ts.getModeForUsageLocation(sourceFile, lit, opts);
    return ts.resolveModuleName(stripQuery(lit.text), containingFile, opts, host, cache, redirected, mode);
  });
  const planted = new Map(Object.entries(overlay).map(([rel, text]) => [normalize(join(root, rel)), text]));
  if (planted.size) {
    const { readFile, fileExists, getSourceFile } = host;
    const at = (f) => planted.get(normalize(f));
    host.readFile = (f) => at(f) ?? readFile.call(host, f);
    host.fileExists = (f) => at(f) !== undefined || fileExists.call(host, f);
    host.getSourceFile = (f, lang, ...rest) => (at(f) !== undefined ? ts.createSourceFile(f, at(f), lang, true) : getSourceFile.call(host, f, lang, ...rest));
  }
  const rootNames = listFiles(root);
  for (const p of planted.keys()) if (!rootNames.includes(p)) rootNames.push(p);
  rootNames.push(AMBIENT);
  return { ts, root, files: rootNames.length - 1, program: ts.createProgram({ rootNames, options: compilerOptions, host }) };
}

/** Every compiler error: [{ file, line, col, code: 'TS2339', message }], plus how many files were read and how long it took. */
export async function typecheck(o = {}) {
  const started = Date.now();
  const { ts, root, files, program } = await buildProgram(o);
  const diagnostics = [];
  for (const d of ts.getPreEmitDiagnostics(program)) {
    const message = ts.flattenDiagnosticMessageText(d.messageText, ' ');
    if (isAnnotationOnly(d.code, message)) continue;
    const pos = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : { line: 0, character: 0 };
    diagnostics.push({ file: d.file ? posix(root, d.file.fileName) : '(global)', line: pos.line + 1, col: pos.character + 1, code: 'TS' + d.code, message });
  }
  return { diagnostics, files, ms: Date.now() - started };
}

/** Every lint hit, in the same shape, with code 'lint/<rule>'. Run from `root`, over its src/. */
export function lint({ root = REPO } = {}) {
  const started = Date.now();
  const bin = join(dirname(createRequire(import.meta.url).resolve('oxlint/package.json')), 'bin', 'oxlint');
  const r = spawnSync(process.execPath, [bin, '-c', LINT_CONFIG, 'src', '--ignore-pattern', 'src/vendor/**', '--format=json'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  /* 0 clean, 1 hits; anything else is the tool failing, and a failed tool must never read as clean */
  if (r.status !== 0 && r.status !== 1) throw new Error('oxlint exited ' + r.status + ': ' + String(r.stderr || r.error).slice(0, 400));
  const parsed = JSON.parse(r.stdout);
  if (!Number.isInteger(parsed.number_of_rules) || parsed.number_of_rules < 40) throw new Error('oxlint ran ' + parsed.number_of_rules + ' rules: its config did not load');
  const diagnostics = parsed.diagnostics.map((d) => {
    const span = (d.labels && d.labels[0] && d.labels[0].span) || {};
    const rule = (/\(([^)]+)\)/.exec(d.code) || [])[1] || d.code;
    return { file: posix(root, resolve(root, String(d.filename))), line: span.line || 0, col: span.column || 0, code: 'lint/' + rule, message: d.message };
  });
  return { diagnostics, files: parsed.number_of_files, ms: Date.now() - started };
}

/** { [file]: { [code]: count } }, the shape the ratchet stores. Keys sorted, so the baseline diffs line by line. */
export function countByFile(diagnostics) {
  const out = {};
  for (const d of [...diagnostics].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0))) {
    const row = (out[d.file] ||= {});
    row[d.code] = (row[d.code] || 0) + 1;
  }
  return out;
}

/* How much of the code the checker can see: a property read on an `any` receiver is one no field name is checked on. */
async function coverage() {
  const { ts, root, program } = await buildProgram({});
  const checker = program.getTypeChecker();
  const folders = {};
  const blind = {};
  for (const sf of program.getSourceFiles()) {
    const rel = posix(root, sf.fileName);
    if (!rel.startsWith('src/') || sf.isDeclarationFile) continue;
    const folder = rel.split('/').slice(0, 2).join('/');
    const row = (folders[folder] ||= { reads: 0, blind: 0 });
    const visit = (n) => {
      if (ts.isPropertyAccessExpression(n)) {
        row.reads++;
        if (checker.getTypeAtLocation(n.expression).flags & ts.TypeFlags.Any) {
          row.blind++;
          const e = n.expression;
          const name = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? '.' + e.name.text : '(expr)';
          blind[name] = (blind[name] || 0) + 1;
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  let reads = 0; let seen = 0;
  console.log('Property reads the checker can see, by folder');
  for (const [f, r] of Object.entries(folders).sort((a, b) => b[1].reads - a[1].reads)) {
    reads += r.reads; seen += r.reads - r.blind;
    console.log(`  ${String(Math.round((100 * (r.reads - r.blind)) / r.reads)).padStart(3)}%  ${String(r.reads).padStart(6)} reads  ${f}`);
  }
  console.log(`  ${Math.round((100 * seen) / reads)}% of ${reads} overall`);
  console.log('\nThe receivers it cannot see, most reads first (each a JSDoc type waiting to pay)');
  for (const [k, n] of Object.entries(blind).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${String(n).padStart(6)}  ${k}`);
}

function table(title, counts, limit = 40) {
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  console.log(`\n${title}`);
  for (const [k, n] of rows.slice(0, limit)) console.log(`  ${String(n).padStart(6)}  ${k}`);
  if (rows.length > limit) console.log(`  ...and ${rows.length - limit} more`);
}

/** The counts by error kind and by folder. */
export function printReport(diagnostics) {
  const kinds = {}; const example = {}; const folders = {};
  for (const d of diagnostics) {
    kinds[d.code] = (kinds[d.code] || 0) + 1;
    example[d.code] ||= d.message.slice(0, 90);
    const f = d.file.split('/').slice(0, 2).join('/');
    folders[f] = (folders[f] || 0) + 1;
  }
  table('By error kind', Object.fromEntries(Object.entries(kinds).map(([c, n]) => [`${c}  ${example[c]}`, n])));
  table('By folder', folders);
}

/* The edit hook's half (tools/hooks/edit-checks.mjs): the lint alone, under a second. A checkout with no install has nothing to run, and the hook is not a gate. */
function lintForHook() {
  try { createRequire(import.meta.url).resolve('oxlint/package.json'); } catch (e) { return 0; }
  const { diagnostics } = lint();
  for (const d of diagnostics) console.error(`${d.file}:${d.line}:${d.col} ${d.code} ${d.message}`);
  return diagnostics.length ? 1 : 0;
}

async function main(argv) {
  if (argv.includes('--lint-if-installed')) return lintForHook();
  if (argv.includes('--coverage')) { await coverage(); return 0; }
  const options = {};
  argv.forEach((a, i) => { if (a === '--opt') options[argv[i + 1]] = true; });
  const types = await typecheck({ options });
  const hits = lint();
  const all = [...types.diagnostics, ...hits.diagnostics];
  const listAt = argv.indexOf('--list');
  const fileAt = argv.indexOf('--file');
  if (listAt >= 0 || fileAt >= 0) {
    const raw = listAt >= 0 ? argv[listAt + 1] : null;
    const code = raw && !raw.startsWith('--') ? (/^\d+$/.test(raw) ? 'TS' + raw : raw) : null;
    for (const d of all) {
      if ((code && d.code !== code) || (fileAt >= 0 && d.file !== argv[fileAt + 1])) continue;
      console.log(`${d.file}:${d.line}:${d.col} ${d.code} ${d.message}`);
    }
    return 0;
  }
  printReport(all);
  console.log(`\n${all.length} errors in ${Object.keys(countByFile(all)).length} of ${types.files} files; compiler ${(types.ms / 1000).toFixed(1)} s, lint ${(hits.ms / 1000).toFixed(1)} s`);
  return 0;
}

if (isMain(import.meta.url)) {
  try { process.exit(await main(process.argv.slice(2))); } catch (e) { console.error(String(e.message || e)); process.exit(2); }
}
