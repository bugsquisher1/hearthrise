#!/usr/bin/env node
// tools/balance-lab/build.mjs — THE BALANCE LAB'S ENGINE BUNDLE: the game's own src/core + src/data (and the edge's
// settle) as ONE browser file, never a second copy in the repo.
//
//   node tools/balance-lab/build.mjs [--out DIR]     default tools/balance-lab/dist (gitignored: rebuild, never commit)
//
// Writes:
//   dist/engine.js   an ES module: `import { runCell, playCell, ... } from './engine.js'` (node or a browser). No DOM, no
//                    network, no Supabase, no secrets: the graph is walked from tools/balance-lab/lab-core.mjs and may
//                    only reach src/core, src/data, src/build-info.js, the hr-accrue settle files it imports, tools/
//                    balance-sim's pure helpers and this folder (anything else stops the build).
//   dist/worker.js   a CLASSIC script holding the same modules plus worker-main.mjs: a Web Worker built from it plays
//                    cells off the page's thread; loaded as a plain <script> in a page (where no worker can start) it
//                    leaves `globalThis.HearthriseLab` instead. Classic on purpose: it starts from a file URL, a blob
//                    URL or an artifact host alike, with no module loader and no CORS.
//
// HOW: each module is transpiled ESM -> CommonJS by the TypeScript compiler the repo already pins (typescript, a
// devDependency), comments stripped, and wrapped in a registry keyed by its repo path. `?v=` query strings are
// dropped while resolving (the cache-buster is a browser concern; one file = one module instance, so the dials in
// dials.mjs move the same rows every caller reads). Bare `node:*` imports map to tools/balance-lab/shims (a pure
// HMAC-SHA256 for the edge's hunt seeder; stubs that throw for node:url / node:path). Live bindings hold: an
// importer reads `mod.name` at the moment it runs, as ESM does.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { isMain } from '../../tests/_is-main.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const rel = (abs) => relative(ROOT, abs).split(sep).join('/');

const ENTRY = 'tools/balance-lab/api.mjs';
const WORKER_ENTRY = 'tools/balance-lab/worker-main.mjs';
/* GENERATED MODULES (no file on disk): the target sheet is src/data/balance-sheet.js when the tree has it
   (lane/b-ground-formula), else an empty module (the lab grades on the 10-25 ruling and offers no scale preview) */
const SHEET_FILE = 'src/data/balance-sheet.js';
const VIRTUAL = {
  'tools/balance-lab/virtual/sheet.mjs': () => (existsSync(join(ROOT, SHEET_FILE)) ? "export * from '../../../" + SHEET_FILE + "';\n" : 'export {};\n'),
};
/* the trees a bundled module may come from (anything else is a mistake in the graph: the client, the network, secrets) */
const ALLOWED = [/^src\/core\//, /^src\/data\//, /^src\/build-info\.js$/, /^supabase\/functions\/hr-accrue\/[\w-]+\.js$/,
  /^tools\/balance-lab\/[\w/-]+\.mjs$/, /^tools\/balance-sim\/(stats|gear)\.mjs$/];
const SHIMS = { 'node:crypto': 'tools/balance-lab/shims/node-crypto.mjs', 'node:url': 'tools/balance-lab/shims/node-stub.mjs', 'node:path': 'tools/balance-lab/shims/node-stub.mjs' };
/* words that must never appear in a bundled module's CODE (comments are stripped first) */
const FORBIDDEN = [/\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\blocalStorage\b/, /\bdocument\./, /supabase\.co/, /\bDeno\.env\b/, /service_role/];

function resolveSpec(fromId, spec) {
  if (SHIMS[spec]) return SHIMS[spec];
  if (!spec.startsWith('.')) throw new Error('balance-lab build: ' + fromId + ' imports "' + spec + '": only relative imports and ' + Object.keys(SHIMS).join(', ') + ' are bundled');
  const abs = resolve(ROOT, dirname(fromId), spec.replace(/\?.*$/, ''));
  const id = rel(abs);
  if (!ALLOWED.some((re) => re.test(id))) throw new Error('balance-lab build: ' + fromId + ' reaches ' + id + ', outside the engine trees the lab may bundle');
  if (!VIRTUAL[id] && !existsSync(abs)) throw new Error('balance-lab build: ' + fromId + ' imports a missing file ' + id);
  return id;
}
const sourceOf = (id) => (VIRTUAL[id] ? VIRTUAL[id]() : readFileSync(join(ROOT, id), 'utf8'));

/** Walk the static graph from `entries`; answers [{ id, code }] in first-visit order and the source hash. */
export function collect(entries) {
  const mods = new Map();
  const hash = createHash('sha256');
  const visit = (id) => {
    if (mods.has(id)) return;
    mods.set(id, null);
    const src = sourceOf(id);
    hash.update(id + '\0' + src + '\0');
    const specs = ts.preProcessFile(src, true, true).importedFiles.map((f) => f.fileName);
    const map = new Map(specs.map((s) => [s, resolveSpec(id, s)]));
    const out = ts.transpileModule(src, { fileName: id.replace(/\.mjs$/, '.js'), reportDiagnostics: false, compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, removeComments: true, allowJs: true, esModuleInterop: false, sourceMap: false } });
    let code = out.outputText.replace(/\brequire\((["'])([^"']+)\1\)/g, (all, q, spec) => {
      if (!map.has(spec)) throw new Error('balance-lab build: ' + id + ' compiled a require of "' + spec + '" its imports do not name');
      return '__req(' + JSON.stringify(map.get(spec)) + ')';
    });
    code = code.replace(/^\/\/# sourceMappingURL=.*$/m, '');
    for (const re of FORBIDDEN) if (re.test(code)) throw new Error('balance-lab build: ' + id + ' holds ' + re + ': the lab bundles no network, storage, DOM or secrets');
    mods.set(id, code);
    for (const dep of map.values()) visit(dep);
  };
  for (const e of entries) visit(e);
  return { modules: [...mods].map(([id, code]) => ({ id, code })), hash: hash.digest('hex').slice(0, 12) };
}

/* the registry every bundle opens with: one function per module, run once on first require, cached (cycles see the
   exports filled so far, as CommonJS does; the transpiler hoists function exports, as ESM does) */
function registry(modules) {
  const defs = modules.map(({ id, code }) => JSON.stringify(id) + ': function (exports, __req, module) {\n' + code + '\n}').join(',\n');
  return 'const __defs = {\n' + defs + '\n};\n'
    + 'const __cache = Object.create(null);\n'
    + 'function __req(id) {\n'
    + '  const hit = __cache[id]; if (hit) return hit.exports;\n'
    + '  const def = __defs[id]; if (!def) throw new Error("balance-lab bundle: no module " + id);\n'
    + '  const module = { exports: {} }; __cache[id] = module;\n'
    + '  def.call(module.exports, module.exports, __req, module);\n'
    + '  return module.exports;\n'
    + '}\n';
}

/** Build both files into `outDir`; answers { files, modules, hash, version, bytes }. */
export function build(outDir = join(HERE, 'dist')) {
  /* the game version the bundle carries (src/build-info.js BUILD.version, read as text: the build never runs game code) */
  const BUILD_VERSION = (readFileSync(join(ROOT, 'src/build-info.js'), 'utf8').match(/version:\s*'([^']+)'/) || [])[1] || '?';
  const engine = collect([ENTRY]);
  const worker = collect([WORKER_ENTRY]);
  const stamp = { version: BUILD_VERSION, hash: engine.hash, built: new Date().toISOString(), modules: engine.modules.length };
  const head = (what) => '// tools/balance-lab/dist/' + what + ' — GENERATED by tools/balance-lab/build.mjs from the game\'s own src/core + src/data at v'
    + stamp.version + ' (sources ' + stamp.hash + '). Do not edit; rebuild.\n';
  const names = Object.keys(apiNames());
  const engineText = head('engine.js') + registry(engine.modules)
    + 'const __lab = __req(' + JSON.stringify(ENTRY) + ');\n'
    + 'export const BUNDLE = Object.freeze(' + JSON.stringify(stamp) + ');\n'
    + 'export const { ' + names.join(', ') + ' } = __lab;\n'
    + 'export default __lab;\n';
  const workerText = head('worker.js') + '(function () {\n"use strict";\n' + registry(worker.modules)
    + 'globalThis.__HEARTHRISE_LAB_BUNDLE__ = ' + JSON.stringify(stamp) + ';\n'
    + '__req(' + JSON.stringify(WORKER_ENTRY) + ');\n})();\n';
  mkdirSync(outDir, { recursive: true });
  /* a raw NUL in a source literal (the FNV helper's parts.join) is written as its \u0000 escape: the same string value, and the Artifact publisher refuses NUL bytes */
  const noNul = (t) => t.split(String.fromCharCode(0)).join('\\u0000');
  writeFileSync(join(outDir, 'engine.js'), noNul(engineText));
  writeFileSync(join(outDir, 'worker.js'), noNul(workerText));
  return { files: [join(outDir, 'engine.js'), join(outDir, 'worker.js')], modules: engine.modules.length, hash: engine.hash, version: stamp.version,
    bytes: { engine: Buffer.byteLength(engineText), worker: Buffer.byteLength(workerText) } };
}

/* the names api.mjs exports, read from the sources it re-exports (so engine.js re-exports each one by name) */
function apiNames(id = ENTRY, out = {}) {
  const src = sourceOf(id);
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) out[m[1]] = true;
  for (const m of src.matchAll(/^export\s*\{([^}]+)\}/gm)) for (const n of m[1].split(',')) { const k = n.trim().split(/\s+as\s+/).pop(); if (k) out[k] = true; }
  for (const m of src.matchAll(/^export\s*\*\s*from\s*['"]([^'"]+)['"]/gm)) apiNames(resolveSpec(id, m[1]), out);
  return out;
}

if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const out = i > 0 && process.argv[i + 1] ? resolve(process.argv[i + 1]) : join(HERE, 'dist');
  const t = Date.now();
  const r = build(out);
  console.log('balance-lab build: v' + r.version + ', ' + r.modules + ' modules (sources ' + r.hash + '), engine.js ' + Math.round(r.bytes.engine / 1024) + ' KB, worker.js '
    + Math.round(r.bytes.worker / 1024) + ' KB in ' + (Date.now() - t) + ' ms -> ' + out);
}
