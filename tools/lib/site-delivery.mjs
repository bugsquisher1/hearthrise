// ════════════════════════════════════════════════════════════════════════
// tools/lib/site-delivery.mjs — HOW THE SITE'S MODULES REACH A PLAYER: EACH ONE MINIFIED, THE GAME BUNDLED.
//
// The source is written to be read: 45% of its bytes are comments (architecture audit 2026-11-19, item 1), and the page
// asked for some 600 files one by one (item 5). tools/build-site.mjs publishes the site through these two steps; the
// repository, the tests and the test servers keep the source as written (tests/_client-harness.mjs and
// tools/qa/local-world.mjs serve the source; `local-world --site _site` serves this delivery).
//
//   minifyModules  every ES module of the site, one by one (esbuild transform), at TARGET. A classic script (no import or
//                  export: the platform scripts, the glyph atlas), src/vendor/ (pinned by name and sha384) and AS_IS stay
//                  byte for byte.
//   bundleGame     the page's module graph from src/app/boot.js, with splitting: the sign-in half becomes boot.js and the
//                  chunks it imports, every literal import() becomes its own chunk under src/chunks/, and code two of them
//                  share is one chunk, so each module still runs once. RUNTIME_MODULES (a module imported by a URL built at
//                  run time) are entries too, at their own paths, sharing the same chunks. src/app/game-modules.js (the list
//                  boot.js preloads) stays its own file, written with the chunks behind the sign-in screen; play.html's
//                  preload block names the sign-in chunks.
//   moduleGraph    the static and dynamic imports of any set of served modules, read by esbuild's own parser (minified
//                  or not, comments never count): tools/build-site.mjs SITE-10 walks it.
//
// TARGET: the source needs nothing past ES2020 but import attributes (src/world/atlas.js: `{ with: { type: 'json' } }`),
// which an es2020 target DROPS without a word (measured 2026-11-19). So SUPPORTED keeps them, and every module is minified
// twice, at TARGET and at esnext: a module whose two differ uses syntax the target lowers or drops, and the build is red
// with its name (build-site SITE-11) instead of serving it changed.
//
// import.meta.url inside a bundle is the CHUNK's address, not the module's: `new URL('./x.js', import.meta.url)` would
// point beside the chunk. Each bundled module's import.meta.url is therefore its own original address (at the chunk's own
// ?v=), written as a path from the site root that each output file fills in for its own folder.
// mutant-anchors: none — a library; its proofs are tools/build-site.mjs --selftest (SITE-10, SITE-11)
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { createRequire } from 'node:module';
import { stampModule } from './version-stamp.mjs';

export const TARGET = 'es2020';
export const SUPPORTED = Object.freeze({ 'import-attributes': true });
export const VENDOR = 'src/vendor/';
export const ENTRY = 'src/app/boot.js';
export const GAME_LIST = 'src/app/game-modules.js';
export const CHUNKS = 'src/chunks/';

/* Read as text, not run as a module: minifying it would change what its reader parses. */
export const AS_IS = Object.freeze({
  'src/build-info.js': "pages.yml and the release check read its version: '…' line; src/app/new-version.js fetches it as text",
});

/* A module imported at run time by a URL its importer builds (`import(new URL('./x.js', import.meta.url))`): no bundler can
   follow that, so each is an entry of the bundle at its own path and shares the bundle's chunks (one instance of every
   module). build-site SITE-11 holds this list to the source's `new URL('….js', import.meta.url)` loads, with RUNTIME_FILES. */
export const RUNTIME_MODULES = Object.freeze({
  'src/shell/windows/game-master-body.js': 'src/shell/windows/game-master.js imports it by URL on the window\'s first open',
});
/* A .js file loaded by URL that is not a module of the graph. */
export const RUNTIME_FILES = Object.freeze({
  'src/data/glyphs.js': 'a classic script src/app/glyphs-loader.js appends to the page',
  'src/build-info.js': 'src/app/new-version.js fetches it as text to read the release the site serves',
});

const ROOT_MARK = '@@HR_SITE_ROOT@@';

/** esbuild, from the repository's devDependencies; a clear harness error when it is not installed. */
export function loadEsbuild(root) {
  try { return createRequire(join(root, 'package.json'))('esbuild'); } catch (e) {
    throw new Error('esbuild is not installed (a devDependency): run npm install, or build with --deliver plain. ' + (e && e.message || e));
  }
}

/** An ES module (a static import or export at a line's start), as opposed to a classic script. */
export const isEsm = (text) => /^[ \t]*(?:import\s*[\w{*'"]|export\s)/m.test(text);

/** Is this site file minified as a module? */
export const minifiable = (rel, text) => rel.startsWith('src/') && rel.endsWith('.js') && !rel.startsWith(VENDOR) && !(rel in AS_IS) && isEsm(text);

const options = (target) => ({ loader: 'js', format: 'esm', minify: true, target, supported: SUPPORTED, charset: 'utf8', legalComments: 'none' });

/**
 * One module, minified. `drift` is set when the module minifies differently at TARGET than at esnext: syntax the target
 * would lower or drop. `parsed` is the module as esbuild reads it, not minified (its comments gone): what its specifiers
 * are held to (a JSDoc `import('./x.js')` type is not a load).
 * @returns {{ code: string, drift: boolean, parsed: string }}
 */
export function minifyModule(esbuild, text) {
  const code = esbuild.transformSync(text, options(TARGET)).code;
  const next = esbuild.transformSync(text, options('esnext')).code;
  const parsed = esbuild.transformSync(text, { ...options('esnext'), minify: false }).code;
  return { code, drift: code !== next, parsed };
}

/** The path from a site file's folder back to the site root ('' at the root, '../' a folder down). */
const toRoot = (rel) => '../'.repeat(rel.split('/').length - 1);

/**
 * THE BUNDLE. `siteDir` holds the site as built (every module stamped at `version`); returns the files the bundle writes over
 * it, each stamped, with the lists the page needs.
 * @returns {Promise<{ files: Map<string, string>, entries: string[], signIn: string[], game: string[], inputs: Map<string, string> }>}
 *   files: site path -> text; signIn: the entry and every chunk its static graph reaches; game: every other chunk (the list
 *   boot.js preloads); inputs: source module -> the output that holds it.
 */
export async function bundleGame(esbuild, siteDir, version, read = (rel) => readFileSync(join(siteDir, ...rel.split('/')), 'utf8')) {
  const abs = (rel) => join(siteDir, ...rel.split('/'));
  const site = (p) => relative(siteDir, p).split(sep).join('/');
  const entries = [ENTRY, ...Object.keys(RUNTIME_MODULES)];
  const plugin = {
    name: 'hearthrise-site',
    setup(b) {
      b.onResolve({ filter: /^\.\.?\// }, (a) => {
        const rel = posix.normalize(posix.join(posix.dirname(site(a.importer)), a.path.split(/[?#]/)[0]));
        if (rel === GAME_LIST) return { path: ROOT_MARK + rel, external: true };   // written by the build, after the chunks are known
        if (rel.startsWith(VENDOR)) return { path: ROOT_MARK + rel, external: true };
        return { path: abs(rel) };
      });
      b.onLoad({ filter: /\.js$/ }, (a) => {
        let text = read(site(a.path));
        if (text.includes('import.meta.url')) {
          const self = JSON.stringify(ROOT_MARK + site(a.path));
          text = text.split('import.meta.url').join('new URL(' + self + ' + new URL(import.meta.url).search, import.meta.url).href');
        }
        return { contents: text, loader: 'js' };
      });
    },
  };
  const got = await esbuild.build({
    entryPoints: entries.map(abs), bundle: true, splitting: true, format: 'esm', minify: true, target: TARGET, supported: SUPPORTED,
    charset: 'utf8', legalComments: 'none', outdir: siteDir, outbase: siteDir, entryNames: '[dir]/[name]', chunkNames: CHUNKS + '[name]-[hash]',
    write: false, metafile: true, logLevel: 'silent', plugins: [plugin], absWorkingDir: siteDir,
  });
  const files = new Map(), inputs = new Map(), graph = new Map();
  for (const f of got.outputFiles) {
    const rel = site(f.path);
    if (!rel.endsWith('.js')) continue;
    files.set(rel, stampModule(f.text.split(ROOT_MARK).join(toRoot(rel)), version));
  }
  /* metafile paths are from absWorkingDir (the site), posix */
  for (const [out, o] of Object.entries(got.metafile.outputs)) {
    if (!out.endsWith('.js')) continue;
    for (const i of Object.keys(o.inputs)) inputs.set(i, out);
    graph.set(out, o.imports.filter((x) => x.kind === 'import-statement' && !x.external).map((x) => x.path));
  }
  for (const f of files.keys()) if (!graph.has(f)) throw new Error('the bundle wrote ' + f + ' and its metafile does not name it');
  const signIn = new Set([ENTRY]);
  for (const f of signIn) for (const t of graph.get(f) || []) signIn.add(t);
  const game = Array.from(files.keys()).filter((f) => f.startsWith(CHUNKS) && !signIn.has(f)).sort();
  return { files, entries, signIn: Array.from(signIn), game, inputs };
}

/** src/app/game-modules.js as the bundled site serves it: the chunks behind the sign-in screen. */
export function gameListText(game) {
  return '// src/app/game-modules.js AS PUBLISHED (tools/build-site.mjs, the bundled site): the chunks behind the sign-in screen,\n'
    + '// preloaded by boot.js at its own stamp. The source\'s list names the modules; this one names what the bundle made of them.\n'
    + 'export const GAME_MODULES = Object.freeze(' + JSON.stringify(game) + ');\n';
}

/** play.html with its generated preload block naming `signIn` (the entry and its chunks) instead of the source's modules. */
export function preloadBlock(html, signIn, version) {
  const begin = html.indexOf('<!-- MODULE PRELOAD'), end = html.indexOf('<!-- /MODULE PRELOAD -->');
  if (begin < 0 || end < begin) throw new Error('play.html has no MODULE PRELOAD block to rewrite');
  const block = html.slice(begin, end).split('\n').filter((l) => !/rel="modulepreload"/.test(l));
  const links = signIn.map((f) => '<link rel="modulepreload" href="' + f + '?v=' + version + '">');
  return html.slice(0, begin) + block.concat(links).join('\n') + '\n' + html.slice(end);
}

/**
 * Every static and dynamic import of `roots` and what they reach, read by esbuild's parser from `read` (site path -> text).
 * @returns {Promise<{ graph: Map<string, { static: string[], dynamic: string[] }>, missing: string[] }>}
 */
export async function moduleGraph(esbuild, read, has, roots) {
  const graph = new Map(), missing = new Set();
  const plugin = {
    name: 'hearthrise-graph',
    setup(b) {
      b.onResolve({ filter: /.*/ }, (a) => {
        if (a.kind === 'entry-point') return { path: a.path.replace(/^\.\//, ''), namespace: 'site' };
        if (!/^\.\.?\//.test(a.path)) return { path: a.path, external: true };
        const rel = posix.normalize(posix.join(posix.dirname(a.importer), a.path.split(/[?#]/)[0]));
        if (!has(rel)) { missing.add(rel); return { path: rel, external: true }; }
        return { path: rel, namespace: 'site' };
      });
      b.onLoad({ filter: /.*/, namespace: 'site' }, (a) => ({ contents: read(a.path), loader: 'js' }));
    },
  };
  const got = await esbuild.build({ entryPoints: roots, bundle: true, write: false, metafile: true, format: 'esm', splitting: false,
    outdir: 'graph-out', logLevel: 'silent', plugins: [plugin] });
  const key = (p) => p.replace(/^site:/, '').replace(/^\.\//, '');   // an entry point is named './src/…' in the metafile
  for (const [k, v] of Object.entries(got.metafile.inputs)) {
    const file = key(k);
    const own = (kind) => v.imports.filter((x) => x.kind === kind && !x.external).map((x) => key(x.path));
    graph.set(file, { static: own('import-statement'), dynamic: own('dynamic-import') });
  }
  return { graph, missing: Array.from(missing) };
}
