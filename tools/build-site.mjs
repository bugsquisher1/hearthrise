#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/build-site.mjs — THE SITE AS PLAYERS GET IT: A RELEASE CHANGES ONLY THE URLS OF WHAT IT CHANGED.
//
//   node tools/build-site.mjs [--out dist] [--retain-from https://hearthrise.net|DIR] [--built-at ISO]
//   node tools/build-site.mjs --out DIR --as-version X.Y.Z --one-line src/shell/launcher.js   the site as it would be after a one-line release (load-bench, tests)
//
// Runs only for a release (CI, .github/workflows/deploy-site.yml). Local development, tools/qa/local-world.mjs and the test
// harnesses keep serving plain source, and nothing under src/ knows this file exists except the one table in src/site-files.js.
//
// WHAT COMES OUT
//   a/                  every file named by its content: chunks (+ .map), the page's CSS, the world's atlases, the vendored scripts
//   play.html index.html  the pages, naming those files
//   assets/ legal/ prototypes/hunt-sim/  plain paths, as today (the game's icons are asked for by path, never by version)
//   sw.js, src/build-info.js, src/platform/{https-upgrade,sw-killswitch,load-shell}.js   plain paths: the worker, the file new-version.js asks about,
//                       and the brake with its two neighbours, whose ?v= stays the page's way to say which release it is
//   release-files.json  this release's content-named files (the worker carries over what it already holds)
//   releases.json       the same, for every release still kept (see RETENTION)
//   build-map.json      source module -> the chunk it landed in (tests, and whoever reads a stack trace by hand)
//
// THE CHUNKS follow how often things change, not only when a player needs them: a change to one window re-downloads the shell's chunk, not
// the game's data. esbuild chunks by which entry points reach a module, so each layer below is one extra entry point nobody loads.
// BUILD (src/build-info.js) is read from the page (<html data-build>), never written into a chunk, or every release would rename them all.
//
// RETENTION: a deploy replaces the whole site, and an open tab still asks for its own chunks. --retain-from reads the deployed
// releases.json, keeps the files of recent releases (KEEP_DAYS, at least KEEP_MIN, at most KEEP_MAX) with each file's sha256 checked, and fails
// when the deployed site cannot be read (a 404 on releases.json is a first deploy). Maps are kept for KEEP_MAPS releases.
// A first deploy also keeps the plain folder (FIRST_DEPLOY_DIRS): a tab opened before the switch still asks for src/...?v= and the plain atlases, and has its banner to reload.
// Proof: tests/ship-build.mjs. Rollback, the deploy and what this replaces: docs/planning/PRIORITY_BOARD.md (2026-11-04).
// mutant-anchors: none — tests/ship-build.mjs plants its defects into built output and into copies of the sources
// ════════════════════════════════════════════════════════════════════════
import * as esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = normalize(join(HERE, '..'));
const OUT_HASHED = 'a';
const ENTRY = 'src/app/boot.js';
const VERSION_QUERY = /\?v=\d+\.\d+\.\d+/;
const HASH_LEN = 10;
const KEEP_DAYS = 14, KEEP_MIN = 3, KEEP_MAX = 30, KEEP_MAPS = 3;
/* What stays at its plain path. The three platform scripts keep their ?v= too: it is how the kill-switch and the loading shell read this page's release. */
const PLAIN_SCRIPTS = ['src/platform/https-upgrade.js', 'src/platform/sw-killswitch.js', 'src/platform/load-shell.js'];
const PLAIN_FILES = ['CNAME', '.nojekyll', 'sw.js', 'src/build-info.js', ...PLAIN_SCRIPTS];
const PLAIN_DIRS = ['legal', 'assets/brand', 'assets/ui', 'assets/icons-bundle', 'prototypes/hunt-sim'];
const FIRST_DEPLOY_DIRS = ['src', 'assets/world'];
/* The layers, slowest-changing data first: a module goes in the first layer whose test it passes. */
const LAYERS = [['data', /^src\/data\//], ['core', /^src\/core\//], ['session', /^src\/(session|net)\//], ['world', /^src\/(world|hunt-view|render)\//], ['shell', /^src\/(shell|social)\//]];

const posix = (p) => p.split(sep).join('/');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const hashedName = (rel, buf) => { const ext = extname(rel); return OUT_HASHED + '/' + basename(rel, ext) + '-' + sha256(buf).slice(0, HASH_LEN) + ext; };

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(f)); else out.push(f);
  }
  return out;
}

/** A plain file copied to its content name once; the table of all of them is what src/site-files.js and the pages read. */
function hashCopier(root, out) {
  const table = new Map();
  return {
    table,
    put(rel) {
      if (table.has(rel)) return table.get(rel);
      const src = join(root, rel);
      if (!existsSync(src)) throw new Error('build-site: ' + rel + ' is asked for and does not exist');
      const buf = readFileSync(src);
      const name = hashedName(rel, buf);
      mkdirSync(dirname(join(out, name)), { recursive: true });
      writeFileSync(join(out, name), buf);
      table.set(rel, name);
      return name;
    },
  };
}

/* A source file as this build sees it (`patch`: { rel: text => text }, a test's or a measurement's change that touches no file). */
const sourceOf = (root, rel, patch) => { const text = readFileSync(join(root, rel), 'utf8'); return patch && patch[rel] ? patch[rel](text) : text; };

/* BUILD as the source states it (src/build-info.js), read by regex: importing it would run its window branch and its console line for nothing. */
function buildInfoOf(root, patch) {
  const text = sourceOf(root, 'src/build-info.js', patch);
  const field = (name) => { const m = new RegExp('\\b' + name + ":\\s*(?:'([^']*)'|null)").exec(text); if (!m) throw new Error('build-site: src/build-info.js states no ' + name); return m[1] === undefined ? null : m[1]; };
  return { version: field('version'), cache: field('cache'), channel: field('channel'), date: field('date'), commit: field('commit') };
}

function sourcePlugin(root, copier, patch) {
  const SITE_FILES = 'src/site-files.js';
  const BUILD_INFO = 'src/build-info.js';
  return {
    name: 'hearthrise-source',
    setup(b) {
      /* A ?v= is a browser's cache-buster; to the bundler the file is the file. */
      b.onResolve({ filter: VERSION_QUERY }, (a) => b.resolve(a.path.replace(VERSION_QUERY, ''), { resolveDir: a.resolveDir, kind: a.kind, importer: a.importer }));
      b.onLoad({ filter: /\.js$/, namespace: 'file' }, (a) => {
        const rel = posix(relative(root, a.path));
        let text = sourceOf(root, rel, patch);
        if (rel === SITE_FILES) {
          const anchor = 'const HASHED = null;';
          if (!text.includes(anchor)) throw new Error('build-site: ' + SITE_FILES + ' moved its anchor');
          text = text.replace(anchor, 'const HASHED = ' + JSON.stringify(Object.fromEntries(copier.table)) + ';');
        } else if (rel === BUILD_INFO) {
          const from = /export const BUILD = Object\.freeze\(\{[\s\S]*?\}\);/;
          if (!from.test(text)) throw new Error('build-site: ' + BUILD_INFO + ' moved its anchor');
          text = text.replace(from, 'export const BUILD = Object.freeze(JSON.parse(document.documentElement.dataset.build));');
        } else {
          /* a brand image's literal path in code (the sign-in crest), with or without a version */
          text = text.replace(/assets\/brand\/[\w.-]+\.png(?:\?v=\d+\.\d+\.\d+)?/g, (m) => copier.put(m.replace(VERSION_QUERY, '')));
        }
        return { contents: text, loader: 'js' };
      });
      /* A layer: an entry point nobody loads, that reaches its modules and so gives them a chunk of their own. */
      b.onResolve({ filter: /^hr-layer:/ }, (a) => ({ path: a.path, namespace: 'hr-layer' }));
      b.onLoad({ filter: /.*/, namespace: 'hr-layer' }, (a) => ({ contents: LAYER_FILES.get(a.path), resolveDir: root, loader: 'js' }));
    },
  };
}
const LAYER_FILES = new Map();

const SHARED_ESBUILD = { bundle: true, format: 'esm', minify: true, target: 'esnext', charset: 'utf8', legalComments: 'none', logLevel: 'silent' };

async function buildChunks(root, out, copier, patch) {
  const plugin = sourcePlugin(root, copier, patch);
  /* First pass: which modules the page loads, so the layers name only those. */
  const first = await esbuild.build({ ...SHARED_ESBUILD, absWorkingDir: root, entryPoints: [ENTRY], splitting: true, outdir: join(out, OUT_HASHED), write: false, metafile: true, plugins: [plugin] });
  const reached = Object.keys(first.metafile.inputs).map(posix).filter((p) => p.startsWith('src/'));
  LAYER_FILES.clear();
  const entryPoints = { boot: ENTRY };
  const claimed = new Set();
  for (const [name, test] of LAYERS) {
    const mods = reached.filter((p) => test.test(p) && !claimed.has(p));
    for (const m of mods) claimed.add(m);
    if (!mods.length) continue;
    LAYER_FILES.set('hr-layer:' + name, mods.map((m) => 'import ' + JSON.stringify('./' + m) + ';').join('\n'));
    entryPoints['layer-' + name] = 'hr-layer:' + name;
  }
  const built = await esbuild.build({ ...SHARED_ESBUILD, absWorkingDir: root, entryPoints, splitting: true, outdir: join(out, OUT_HASHED), entryNames: '[name]-[hash]', chunkNames: 'c-[hash]',
    sourcemap: 'linked', sourcesContent: true, write: false, metafile: true, plugins: [plugin] });
  /* The layers' entry files are never loaded: left out. A source map says src/... from the site's root wherever this ran. */
  const dead = new Set();
  const byPath = new Map(built.outputFiles.map((f) => [posix(relative(root, f.path)), f]));
  const outputs = Object.entries(built.metafile.outputs).map(([k, v]) => [posix(relative(root, resolve(root, k))), v]);
  for (const [k, v] of outputs) if (v.entryPoint && v.entryPoint.startsWith('hr-layer:')) { dead.add(k); dead.add(k + '.map'); }
  const names = {};
  for (const [k, f] of byPath) {
    if (dead.has(k)) continue;
    const name = posix(relative(posix(relative(root, out)), k));
    const file = join(out, name);
    mkdirSync(dirname(file), { recursive: true });
    if (k.endsWith('.map')) {
      const map = JSON.parse(f.text);
      map.sources = map.sources.map((s) => posix(relative(root, resolve(dirname(f.path), s))));
      writeFileSync(file, JSON.stringify(map));
    } else writeFileSync(file, f.contents);
    names[k] = name;
  }
  const entryOutput = outputs.find(([, v]) => v.entryPoint && posix(v.entryPoint) === ENTRY);
  if (!entryOutput) throw new Error('build-site: the entry ' + ENTRY + ' made no output');
  const entry = names[entryOutput[0]];
  /* Who holds what. And the preload list: the entry's static graph, then the literal dynamic imports' (tests/module-preload.mjs's rule for plain source). */
  const buildMap = {};
  const graph = new Map(outputs.filter(([k]) => !dead.has(k) && !k.endsWith('.map')).map(([k, v]) => [names[k], v]));
  for (const [name, v] of graph) for (const input of Object.keys(v.inputs)) if (input.startsWith('src/')) buildMap[posix(input)] = name;
  const preload = [];
  const seen = new Set();
  const rootOutput = posix(relative(root, out));
  const toName = (p) => posix(relative(rootOutput, posix(relative(root, resolve(root, p)))));
  const follow = (name, dyn) => {
    if (seen.has(name)) return;
    seen.add(name);
    preload.push(name);
    const row = graph.get(name);
    if (!row) throw new Error('build-site: ' + name + ' is imported and was not written');
    for (const i of row.imports) if (dyn || i.kind === 'import-statement' || i.kind === 'dynamic-import') follow(toName(i.path), dyn);
  };
  follow(entry, true);
  return { entry, preload, buildMap };
}

async function buildCss(root, out, name, sheets) {
  const virtual = sheets.map((s) => '@import ' + JSON.stringify('./' + s) + ';').join('\n');
  const built = await esbuild.build({ absWorkingDir: root, stdin: { contents: virtual, resolveDir: root, loader: 'css', sourcefile: name + '.css' }, bundle: true, minify: true, charset: 'utf8', logLevel: 'silent',
    outdir: join(out, OUT_HASHED), entryNames: name + '-[hash]', assetNames: '[name]-[hash]', loader: { '.png': 'file', '.webp': 'file', '.jpg': 'file', '.svg': 'file', '.woff2': 'file' }, external: ['https://*'], write: true, metafile: true });
  const css = Object.keys(built.metafile.outputs).find((k) => k.endsWith('.css'));
  return posix(relative(posix(relative(root, out)), posix(relative(root, resolve(root, css)))));
}

/* One page: its stylesheets become one file, its preload block the chunks', every versioned file its content name. */
async function buildPage(root, out, rel, copier, js, info, patch) {
  let html = sourceOf(root, rel, patch);
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="(src\/styles\/[^"?]+)(?:\?v=[^"]*)?">/g)].map((m) => m[1]);
  if (!sheets.length) throw new Error('build-site: ' + rel + ' names no stylesheet');
  const css = await buildCss(root, out, basename(rel, '.html'), sheets);
  let done = false;
  html = html.replace(/<link rel="stylesheet" href="src\/styles\/[^"?]+(?:\?v=[^"]*)?">\n?/g, () => { if (done) return ''; done = true; return '<link rel="stylesheet" href="' + css + '">\n'; });
  if (js) {
    const block = /<!-- MODULE PRELOAD[\s\S]*?<!-- \/MODULE PRELOAD -->/;
    if (!block.test(html)) throw new Error('build-site: ' + rel + ' has no MODULE PRELOAD block');
    const classic = [...html.matchAll(/<link rel="preload" as="script" href="([^"?]+)(?:\?v=[^"]*)?">/g)].map((m) => m[1]);
    const lines = [...classic.map((p) => '<link rel="preload" as="script" href="' + (PLAIN_SCRIPTS.includes(p) ? p : copier.put(p)) + '">'), ...js.preload.map((p) => '<link rel="modulepreload" href="' + p + '">')];
    html = html.replace(block, () => '<!-- MODULE PRELOAD (tools/build-site.mjs) -->\n' + lines.join('\n') + '\n<!-- /MODULE PRELOAD -->');
    const entryTag = /<script type="module" src="src\/app\/boot\.js(?:\?v=[^"]*)?"><\/script>/;
    if (!entryTag.test(html)) throw new Error('build-site: ' + rel + ' has no entry script');
    html = html.replace(entryTag, '<script type="module" src="' + js.entry + '"></script>');
    html = html.replace(/<html\b([^>]*)>/, (m, attrs) => '<html' + attrs + " data-build='" + JSON.stringify(info) + "'>");
  }
  /* The three platform scripts say this page's release by their ?v=, whatever the source wrote; everything else takes its content name. */
  html = html.replace(/\b(src|href)="((?:assets|src)\/[^"?]+)(?:\?v=\d+\.\d+\.\d+)?"/g, (m, attr, path) => attr + '="' + (PLAIN_SCRIPTS.includes(path) ? path + '?v=' + info.version : copier.put(path)) + '"');
  writeFileSync(join(out, rel), html);
}

function listRelease(out, version, builtAt) {
  const files = {}, maps = {};
  for (const f of walk(join(out, OUT_HASHED))) {
    const rel = posix(relative(out, f));
    (rel.endsWith('.map') ? maps : files)[rel] = sha256(readFileSync(f));
  }
  return { version, builtAt, files, maps };
}

/* The deployed site's list, or null on a first deploy. Any other failure throws: a deploy that cannot read the site would silently 404 every open tab's next chunk. */
async function previousList(from, fetchFn) {
  if (!/^https?:\/\//.test(from)) {
    const f = join(from, 'releases.json');
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  }
  const res = await fetchFn(new URL('releases.json', from.endsWith('/') ? from : from + '/').href, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('build-site: the deployed releases.json answered ' + res.status);
  return res.json();
}
async function previousFile(from, rel, fetchFn) {
  if (!/^https?:\/\//.test(from)) return readFileSync(join(from, rel));
  const url = new URL(rel, from.endsWith('/') ? from : from + '/').href;
  let last = null;
  for (let i = 0; i < 3; i++) {
    const res = await fetchFn(url);
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    last = res.status;
    await new Promise((k) => setTimeout(k, 500 * (i + 1)));
  }
  throw new Error('build-site: the deployed ' + rel + ' answered ' + last);
}

/** Which of the older releases stay. Pure. */
export function releasesToKeep(older, builtAt, { days = KEEP_DAYS, min = KEEP_MIN, max = KEEP_MAX } = {}) {
  const cutoff = Date.parse(builtAt) - days * 86400000;
  return older.filter((r, i) => i < min || Date.parse(r.builtAt) >= cutoff).slice(0, max);
}

async function retain(out, from, current, fetchFn) {
  const list = await previousList(from, fetchFn);
  const firstDeploy = list === null;
  const older = (list && Array.isArray(list.releases) ? list.releases : []).filter((r) => r.version !== current.version);
  const kept = releasesToKeep(older, current.builtAt);
  let carried = 0;
  for (const [i, release] of kept.entries()) {
    const rows = i < KEEP_MAPS ? { ...release.files, ...release.maps } : release.files;
    if (i >= KEEP_MAPS) release.maps = {};
    for (const [rel, want] of Object.entries(rows)) {
      if (!rel.startsWith(OUT_HASHED + '/') || rel.includes('..')) throw new Error('build-site: the deployed list names ' + rel);
      const target = join(out, rel);
      if (existsSync(target)) continue;
      const buf = await previousFile(from, rel, fetchFn);
      if (sha256(buf) !== want) throw new Error('build-site: the deployed ' + rel + ' is not the file its release listed');
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, buf);
      carried++;
    }
  }
  return { kept, carried, firstDeploy };
}

/**
 * Build the site.
 * @param {{ root?: string, out: string, retainFrom?: string|null, builtAt?: string, fetch?: typeof fetch }} o
 */
export async function buildSite(o) {
  const root = normalize(o.root || ROOT);
  const out = isAbsolute(o.out) ? normalize(o.out) : normalize(join(root, o.out));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, OUT_HASHED), { recursive: true });
  const info = buildInfoOf(root, o.patch);
  const builtAt = o.builtAt || commitTime(root);
  const copier = hashCopier(root, out);
  /* Files whose URL the game makes at run time. A new atlas set, a new vendored SDK: found here, no list to keep. */
  for (const f of walk(join(root, 'assets/world'))) copier.put(posix(relative(root, f)));
  for (const f of walk(join(root, 'src/vendor'))) copier.put(posix(relative(root, f)));
  copier.put('src/data/glyphs.js');
  copier.put('src/platform/storage.js');
  /* the crest the sign-in draws: a literal in a module, read before the chunks are written */
  const js = await buildChunks(root, out, copier, o.patch);
  await buildPage(root, out, 'play.html', copier, js, info, o.patch);
  await buildPage(root, out, 'index.html', copier, null, info, o.patch);
  for (const f of PLAIN_FILES) {
    mkdirSync(dirname(join(out, f)), { recursive: true });
    if (o.patch && o.patch[f]) writeFileSync(join(out, f), sourceOf(root, f, o.patch)); else cpSync(join(root, f), join(out, f));
  }
  for (const d of PLAIN_DIRS) cpSync(join(root, d), join(out, d), { recursive: true });
  const current = listRelease(out, info.version, builtAt);
  let kept = [], carried = 0, firstDeploy = false;
  if (o.retainFrom) ({ kept, carried, firstDeploy } = await retain(out, o.retainFrom, current, o.fetch || fetch));
  if (firstDeploy) for (const d of FIRST_DEPLOY_DIRS) cpSync(join(root, d), join(out, d), { recursive: true });
  writeFileSync(join(out, 'release-files.json'), JSON.stringify({ version: current.version, files: Object.keys(current.files) }));
  writeFileSync(join(out, 'releases.json'), JSON.stringify({ releases: [current, ...kept] }));
  writeFileSync(join(out, 'build-map.json'), JSON.stringify({ version: current.version, entry: js.entry, preload: js.preload, modules: js.buildMap, files: Object.fromEntries(copier.table) }));
  return { version: info.version, out, entry: js.entry, preload: js.preload, table: Object.fromEntries(copier.table), release: current, kept: kept.map((r) => r.version), carried, firstDeploy };
}

function commitTime(root) {
  try { return execFileSync('git', ['-C', root, 'log', '-1', '--format=%cI'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || new Date().toISOString(); } catch (e) { return new Date().toISOString(); }
}

/* ── THE COMMAND ──────────────────────────────────────────────────────── */
if (process.argv[1] && normalize(process.argv[1]) === normalize(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
  const t0 = Date.now();
  try {
    const patch = {};
    const oneLine = opt('one-line', null);
    if (oneLine) patch[oneLine] = (t) => t + '\nglobalThis.__hrOneLine = 1;\n';
    const asVersion = opt('as-version', null);
    if (asVersion) {
      const was = buildInfoOf(ROOT).version;
      const bump = (t) => t.split('?v=' + was).join('?v=' + asVersion).split("'" + was + "'").join("'" + asVersion + "'");
      for (const f of ['src/build-info.js', 'play.html', 'index.html']) { const prior = patch[f]; patch[f] = prior ? (t) => bump(prior(t)) : bump; }
    }
    const r = await buildSite({ out: opt('out', 'dist'), retainFrom: opt('retain-from', null), builtAt: opt('built-at', undefined), patch });
    const bytes = (p) => statSync(join(r.out, p)).size;
    const js = Object.keys(r.release.files).filter((p) => p.endsWith('.js'));
    console.log('built v' + r.version + ' in ' + (Date.now() - t0) + ' ms: ' + Object.keys(r.release.files).length + ' content-named files, ' + r.preload.length + ' chunks preloaded, ' + r.kept.length + ' older releases kept (' + r.carried + ' files carried)');
    console.log('entry ' + r.entry + ' ' + Math.round(bytes(r.entry) / 1024) + ' KB; all js ' + Math.round(js.reduce((a, p) => a + bytes(p), 0) / 1024) + ' KB raw');
  } catch (e) {
    console.error(e.message || e);
    process.exitCode = 1;
  }
}
