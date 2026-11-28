#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/build-site.mjs — THE SITE IS WHAT THE GAME LOADS, NOT THE REPOSITORY.
//
//   node tools/build-site.mjs [--out DIR]   copy the publish set into _site/ (or DIR), check the copy, print its size
//   node tools/build-site.mjs --check       the same build into a scratch folder, removed after (the smoke.yml guard)
//   node tools/build-site.mjs --left-out    what stays behind under assets/, by folder (--all: every file)
//   node tools/build-site.mjs --selftest    planted holes must go RED by their own rule, the real set GREEN
//   --deliver bundle|minify|plain           how the modules are served (default bundle; see THE DELIVERY below)
//   node tools/build-site.mjs --boot-path [--list]          what a player loads to the sign-in screen and to the first town
//   node tools/build-site.mjs --boot-path-raise "<why>"     raise a stage's ceiling to today's measure, with the reason
//   node tools/build-site.mjs --boot-path-write             lower the ceilings to today's measure (never raises)
//
// WHY (2026-11-10). GitHub Pages published the whole repository from main: 472 MB, then 253 MB once art/review left
// it. v0.2.114's deploy ran past GitHub's 10-minute limit four times, so a release whose server half was live sat
// undeployed for over an hour. The game asks for 10 MB of that. .github/workflows/pages.yml builds this folder and
// deploys it as the Pages artifact; nothing else in the repository is served.
//
// PUBLISH below is the whole list. A file the game asks for that is not in it FAILS THE BUILD, so a hole is a red
// deploy (the site keeps serving the last good one) and never a 404 for a player:
//   SITE-1  every local file a page's tags name (src, href, the link-preview image)
//   SITE-2  every module a published module imports: static, a literal import(), new URL('…', import.meta.url)
//   SITE-3  every url() of a published stylesheet
//   SITE-4  every repository file a published module names in a string: a file exactly, a folder or a name stem by
//           at least one published file (a new art family the allowlist has not heard of). A string that names
//           nothing the repository holds is prose (the data rows cite deleted modules), not a hole in the site.
//   SITE-5  every icon and atlas the data rows name: one per item, basic supply and ability tile, two per atlas set
//   SITE-6  the art left out on purpose (LEFT_OUT) is still drawn by no module
//   SITE-7  the site is under SITE_BUDGET_BYTES (the 10-minute limit is reached by growth nobody measured)
//   SITE-8  non-vacuity: every PUBLISH row matches a file and every reader found a real number of references
//   SITE-9  THE STAMP: every relative specifier in every published module, and every local tag in every page, carries
//           ?v=<BUILD.version>, no other ?v= is left anywhere in a module (a pinned one is a cache lock, b511), and
//           build-info's cache is its version. The build writes the stamp (tools/lib/version-stamp.mjs) as it copies:
//           the source carries none once tools/strip-version-stamps.mjs has run, so a browser keys each release's
//           modules apart (a module at two stamps runs twice, b493) and the service worker kill-switch reads the
//           release off the page's own tags.
//
// THE DELIVERY (architecture audit 2026-11-19, items 1, 3 and 5; tools/lib/site-delivery.mjs). The checks above read the site
// as written and stamped; what a player is served is then, by default (--deliver bundle), every ES module minified and the
// page's graph bundled (esbuild, a devDependency: the one third-party package the deploy runs). --deliver minify does the
// first step alone, --deliver plain neither (the site as written, no esbuild needed). Two more rules read what is served:
//   SITE-10 THE BOOT PATH: the modules and the gzip bytes a player loads to the sign-in screen (play.html's scripts,
//           stylesheets and preloads, and every module their static imports reach) and to the first town (that, plus the
//           list boot.js preloads, src/app/game-modules.js, and its static graph) stay under their ceilings in
//           tests/boot-path.baseline.json (346 modules on 10-31 became 616 by 11-19 and nothing watched). A ceiling goes up
//           only with --boot-path-raise "<what grew and why>"; a cut of more than BOOT_SLACK is red until
//           --boot-path-write locks it in. Only the default delivery is judged. Images and fonts (loaded on use) are not counted.
//   SITE-11 THE DELIVERY IS FAITHFUL: no module minifies differently at the publish target than at esnext (syntax the target
//           would lower or drop); every minified module keeps every relative specifier it had; every `new URL('….js',
//           import.meta.url)` load in the source is a bundle entry or a listed runtime file (RUNTIME_MODULES / RUNTIME_FILES),
//           and every row there is still loaded so; every import of the served graph resolves to a served file; every stylesheet
//           is served minified (no comment, no line break) with its source's rules, every one in the source's order (site-delivery
//           cssRules: a rule dropped, merged or moved, a selector or a condition rewritten, a declaration lost is red).
//
// No dotfile is published: a workflow deploy runs no Jekyll, so .nojekyll is not needed there (it stays in the
// repository for a rollback to the branch source), and actions/upload-pages-artifact leaves dotfiles out.
// Exit: 0 green · 1 a hole · 2 a harness or usage problem.
// The proof plants into in-memory copies of the plan and its readers, never a tree file. Its art cases are drawn from:
// mutant-anchors: src/data/item-art.js src/data/items.js src/data/supply-basics.js src/data/world/atlas-sets.js src/data/world/art-budget.js
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, mkdtempSync, copyFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, posix, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { lex } from './guard-anchors.mjs';
import { isMain } from '../tests/_is-main.mjs';
import { readBuild, stampFile, stripFile, stampKind, moduleSpecifiers, moduleStamps, pageTags } from './lib/version-stamp.mjs';
import { loadEsbuild, minifiable, minifyModule, bundleGame, gameListText, preloadBlock, moduleGraph, isEsm,
  minifiableCss, minifyStylesheet, cssUnminified, cssRules, RUNTIME_MODULES, RUNTIME_FILES, GAME_LIST, ENTRY } from './lib/site-delivery.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// THE PUBLISH SET: one row per reason a browser asks. A star stays inside one folder; two stars and a slash are any depth.
export const PUBLISH = Object.freeze([
  '*.html',                                                  // the pages at the root: the notice and the game
  'CNAME',                                                   // the custom domain (a branch deploy reads it; kept for the rollback)
  'src/**/*.js', 'src/**/*.css',                             // every module and stylesheet
  'assets/brand/hearthrise-crest.png',                       // the loading shell, the sign-in screens, the notice
  'assets/brand/hearth-square.png',                          // Hearth Square behind the account screens (src/app/auth-backdrop.js)
  'assets/brand/hearthrise-mark.png',                        // the tab icon
  'assets/brand/og-image.png',                               // the link preview
  'assets/ui/*.png',                                         // the frames and plates the stylesheets draw
  'assets/ui/tower/*.png',                                   // the Burning Tower window: chimney, firebox, chests (tower.css)
  'assets/world/atlas-*.png', 'assets/world/atlas-*.json',   // the world atlases and their manifests
  'assets/icons-bundle/pixel/items/*.png',                   // one 32 px icon per item row
  'assets/icons-bundle/pixel/abilities/*.png',               // one tile per ability
  'assets/icons-bundle/pixel/supplies/*.png',                // one icon per basic supply
  'assets/icons-bundle/pixel/heads/*.png',                   // one 32 px head per creature
  'assets/icons-bundle/pixel/factions/*.png',                // each side's mark and each piece standing buys
  'assets/fonts/*.woff2', 'assets/fonts/OFL-*.txt',          // the self-hosted faces tokens.css names, and their licence (SIL OFL 1.1)
  'legal/PRIVACY_POLICY.md', 'legal/TERMS_OF_SERVICE.md',    // read by the sign-in screens
]);

/* NAMED BY THE CODE, LEFT OUT ON PURPOSE: the painted item and monster sets (590 files, 22 MB). Their folders are
   constants in the two art manifests, but ITEM_ART_SET is 'pixel' and no module imports a name that builds a painted
   path, so no screen asks for one. SITE-6 holds exactly that: wire one back and the build is red until its folder is
   a PUBLISH row. `names` are the exports of each manifest that never reach a painted folder. */
export const LEFT_OUT = Object.freeze({
  prefixes: Object.freeze(['assets/icons-bundle/hearthfire/', 'assets/icons-bundle/painted/']),
  names: Object.freeze({
    'item-art.js': Object.freeze(['PIXEL_DIR', 'ABILITY_DIR', 'ABILITY_ART', 'SUPPLY_DIR', 'SUPPLY_ART_AHEAD', 'ITEM_ART_AHEAD', 'ITEM_ART_SET', 'fileFor',
      'FACTION_DIR', 'FACTION_ART']),
    'monster-art.js': Object.freeze(['HUNT_ART_ALIAS', 'HUNT_WALK_ART', 'HEAD_DIR', 'HEAD_ART', 'HEAD_ART_AHEAD', 'headPathFor']),
  }),
});

/* Measured 2026-11-10: 10.2 MB. GitHub's limits are a 1 GB site and a 10-minute deploy; 253 MB took 77 s to 17 min
   and 472 MB never finished. Raise this only with the new size and a deploy time beside it. */
export const SITE_BUDGET_BYTES = 25 * 1024 * 1024;

const MARKER = '.built-by-build-site';
const VENDOR = 'src/vendor/';   // third-party bundles, pinned by hash: they load nothing by path, and are not ours to read
/* SITE-1's floor: play.html's tags name the sign-in screen's files only since lane b-first-load (2026-11-13: 63 tags; the game's
   modules are named by src/app/game-modules.js and reached by SITE-2), so the floor reads a broken reader, not the old count. */
const FLOORS = Object.freeze({ 'SITE-1': 40, 'SITE-2': 300, 'SITE-3': 10, 'SITE-4': 5, 'SITE-5': 100 });
/* SITE-9's floor: 2026-11-19 the site carries 2,994 module specifiers and 64 page tags; a reader under these finds nothing to hold. */
const STAMP_FLOORS = Object.freeze({ specifiers: 1500, tags: 40 });

// ── THE PLAN ─────────────────────────────────────────────────────────────
const globRe = (g) => new RegExp('^' + g.split('**/').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('(?:[^/]+/)*') + '$');

/** Every file under `root` as a posix path from it; with `tops`, the root's own files and those folders only. */
function walk(root, tops) {
  const out = [];
  const into = (rel) => {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
      const p = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if (rel || !tops || tops.has(e.name)) into(p); } else if (e.isFile()) out.push(p);
    }
  };
  into('');
  return out.sort();
}

/** The files the rows publish: { files: Map<path, bytes>, dead: rows that matched nothing, repo: every file under the rows' folders }. */
export function publishSet(root = ROOT, rows = PUBLISH) {
  const res = rows.map(globRe), hit = new Set(), files = new Map();
  const repo = walk(root, new Set(rows.filter((g) => g.includes('/')).map((g) => g.split('/')[0])));
  for (const rel of repo) {
    const rowsHit = res.map((r, k) => (r.test(rel) ? k : -1)).filter((k) => k >= 0);
    if (!rowsHit.length) continue;
    for (const k of rowsHit) hit.add(k);
    files.set(rel, statSync(join(root, rel)).size);
  }
  return { files, dead: rows.filter((_, k) => !hit.has(k)), repo };
}

/** What the data rows say the game draws: the icons and atlases by path, and which item art set is live. */
export async function artFacts(root = ROOT) {
  const at = (p) => import(pathToFileURL(join(root, p)).href);
  const [{ ITEMS }, art, { BASIC_SUPPLIES }, sets, { atlasPaths }, mart] = await Promise.all([
    at('src/data/items.js'), at('src/data/item-art.js'), at('src/data/supply-basics.js'), at('src/data/world/atlas-sets.js'), at('src/data/world/art-budget.js'), at('src/data/monster-art.js')]);
  const png = (dir, ids) => ids.map((id) => dir + id + '.png');
  return {
    artSet: art.ITEM_ART_SET,
    item: png(art.PIXEL_DIR, Object.keys(ITEMS).concat(art.ITEM_ART_AHEAD)),
    head: png(mart.HEAD_DIR, mart.HEAD_ART.concat(mart.HEAD_ART_AHEAD)),
    supply: png(art.SUPPLY_DIR, BASIC_SUPPLIES.map((b) => b.id).concat(art.SUPPLY_ART_AHEAD)),
    ability: png(art.ABILITY_DIR, art.ABILITY_ART),
    atlas: sets.LOADED_SETS.concat(Object.keys(sets.MASK_SETS)).flatMap((set) => [atlasPaths(set).image, atlasPaths(set).manifest]),
  };
}

// ── THE READERS ──────────────────────────────────────────────────────────
const STATIC_RE = /^[ \t]*(?:import|export)\b([^;'"]*?)\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/gm;
const BARE_RE = /^[ \t]*import\s*['"](\.{1,2}\/[^'"]+)['"]/gm;
const DYNAMIC_RE = /\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]/g;
const URL_RE = /\bnew URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g;
const SCANNED = new Map();   // file + source -> what it names (a planted edit rescans one file, not five hundred)

function scanJs(file, src, tops) {
  const key = tops.join() + '\0' + file + '\0' + src;
  if (SCANNED.has(key)) return SCANNED.get(key);
  const from = (spec) => posix.normalize(posix.join(posix.dirname(file), spec.split(/[?#]/)[0]));
  const imports = [], clauses = [], named = [];
  for (const m of src.matchAll(STATIC_RE)) { imports.push(['import', from(m[2])]); clauses.push([m[1], from(m[2])]); }
  for (const m of src.matchAll(BARE_RE)) imports.push(['import', from(m[1])]);
  for (const m of src.matchAll(DYNAMIC_RE)) { imports.push(['import()', from(m[1])]); clauses.push(['*', from(m[1])]); }
  for (const m of src.matchAll(URL_RE)) imports.push(['new URL', from(m[1])]);
  const token = new RegExp('(?<![\\w./-])((?:' + tops.join('|') + ')/[\\w./-]*)', 'g');
  for (const s of lex(src).strings) for (const m of s.matchAll(token)) named.push(m[1].replace(/\.+$/, ''));
  const got = { imports, clauses, named };
  SCANNED.set(key, got);
  return got;
}

/** A page or stylesheet reference as a site path, or null when it leaves the site (another host, data:, #). */
function local(ref, dir) {
  if (!ref || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) return null;
  const path = ref.split(/[?#]/)[0];
  return posix.normalize(path.startsWith('/') ? path.slice(1) : posix.join(dir, path));   // the site sits at its domain's root
}

// ── THE CHECK ────────────────────────────────────────────────────────────
/**
 * Everything the site's own files ask for, against the site. Pure: `site.read` and `facts` are arguments, so the
 * proof hands this the real plan with one hole in it.
 * @param {{files: Map<string, number>, dead?: string[], repo: string[], read: (path: string) => string}} site
 * @param {Awaited<ReturnType<typeof artFacts>>} facts
 * @returns {{problems: string[], needs: {rule: string, via: string, path: string, by: string}[], bytes: number}}
 */
export function audit(site, facts, budget = SITE_BUDGET_BYTES) {
  const needs = [], problems = [];
  const need = (rule, via, path, by) => needs.push({ rule, via, path, by });
  const all = Array.from(site.files.keys());
  const repo = new Set(site.repo);
  const held = (p, stem) => (stem ? site.repo.some((f) => f.startsWith(p)) : repo.has(p));   // does the repository hold what a string names?
  const tops = Array.from(new Set(all.filter((f) => f.includes('/')).map((f) => f.split('/')[0])));
  const hosts = site.files.has('CNAME') ? [site.read('CNAME').trim()].flatMap((h) => [h, 'www.' + h]) : [];

  for (const page of all.filter((f) => /^[^/]+\.html$/.test(f))) {
    const html = site.read(page).replace(/<!--[\s\S]*?-->/g, '');
    for (const m of html.matchAll(/\b(?:src|href)\s*=\s*"([^"]*)"/g)) { const p = local(m[1], ''); if (p) need('SITE-1', 'tag', p, page); }
    for (const m of html.matchAll(/\bcontent\s*=\s*"https?:\/\/([^/"]+)\/([^"]+)"/g)) if (hosts.includes(m[1])) need('SITE-1', 'tag', local(m[2], ''), page);
  }
  for (const file of all.filter((f) => f.endsWith('.css'))) {
    const css = site.read(file).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)|@import\s+['"]([^'"]+)['"]/g)) { const p = local(m[1] || m[2], posix.dirname(file)); if (p) need('SITE-3', 'url()', p, file); }
  }
  for (const file of all.filter((f) => f.endsWith('.js') && !f.startsWith(VENDOR))) {
    const got = scanJs(file, site.read(file), tops);
    for (const [via, p] of got.imports) need('SITE-2', via, p, file);
    for (const p of got.named) {
      const via = /\.[A-Za-z0-9]{1,5}$/.test(p) ? 'string' : 'stem';
      if (!LEFT_OUT.prefixes.some((x) => p.startsWith(x)) && held(p, via === 'stem')) need('SITE-4', via, p, file);
    }
    for (const [clause, target] of got.clauses) {
      const safe = LEFT_OUT.names[posix.basename(target)];
      if (!safe) continue;
      const names = clause.includes('*') ? ['*'] : (/\{([^}]*)\}/.exec(clause) || ['', ''])[1].split(',').map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const wired = names.filter((n) => !safe.includes(n));
      if (wired.length) problems.push('SITE-6 ' + file + ' takes ' + wired.join(', ') + ' from ' + target + ': that can draw the painted art, which is not published. Add its folder to PUBLISH (and drop it from LEFT_OUT) first.');
    }
  }
  if (facts.artSet !== 'pixel') problems.push('SITE-6 ITEM_ART_SET is ' + JSON.stringify(facts.artSet) + ': the painted set it switches to is not published (LEFT_OUT).');
  for (const via of ['item', 'supply', 'ability', 'head', 'atlas']) for (const p of facts[via]) need('SITE-5', via, p, 'the ' + via + ' rows');

  const missing = new Map();   // rule + path -> who asks
  for (const n of needs) {
    if (n.path.startsWith('../')) { problems.push(n.rule + ' ' + n.by + ' names ' + n.path + ', outside the site.'); continue; }
    const there = n.via === 'stem' ? all.some((f) => f.startsWith(n.path)) : site.files.has(n.path);
    if (there) continue;
    const key = n.rule + ' ' + n.path;
    missing.set(key, (missing.get(key) || new Set()).add(n.by));
  }
  for (const [key, by] of missing) {
    const who = Array.from(by);
    problems.push(key + ' is asked for by ' + who.slice(0, 3).join(', ') + (who.length > 3 ? ' +' + (who.length - 3) : '') + ' and is not in the site: add a PUBLISH row in tools/build-site.mjs, or stop naming it.');
  }
  const bytes = Array.from(site.files.values()).reduce((a, b) => a + b, 0);
  if (bytes > budget) problems.push('SITE-7 the site is ' + mb(bytes) + ' MB, over its ' + mb(budget) + ' MB budget. Largest: ' + Array.from(site.files).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => f + ' ' + mb(n)).join(', ') + '.');
  for (const row of site.dead || []) problems.push('SITE-8 the PUBLISH row ' + row + ' matches no file: a stale row or a typo.');
  for (const [rule, floor] of Object.entries(FLOORS)) {
    const n = needs.filter((x) => x.rule === rule).length;
    if (n < floor) problems.push('SITE-8 ' + rule + ' found ' + n + ' references, under its floor of ' + floor + ': its reader is not reading.');
  }
  problems.push(...stampProblems(site, all));
  return { problems, needs, bytes };
}

/** SITE-9: every module specifier and page tag of the site, as it will be served, at the one release stamp. */
function stampProblems(site, all, floors = true) {
  if (!site.files.has('src/build-info.js')) return ['SITE-9 src/build-info.js is not in the site: nothing names the release to stamp.'];
  let build;
  try { build = readBuild('', site.read('src/build-info.js')); } catch (e) { return ['SITE-9 ' + e.message]; }
  const want = '?v=' + build.version, out = [], off = new Map();
  if (build.cache !== build.version) out.push('SITE-9 src/build-info.js says cache ' + build.cache + ' and version ' + build.version + ': a release is one string (./bump-version.sh writes both).');
  const flag = (file, what) => off.set(file, (off.get(file) || new Set()).add(what));
  let specs = 0, tags = 0;
  for (const file of all) {
    const kind = stampKind(file);
    if (kind === 'module') {
      const text = site.read(file);
      for (const s of moduleSpecifiers(text)) { specs++; if (s.query !== want) flag(file, "'" + s.spec + s.query + "'"); }
      for (const s of moduleStamps(text)) if (s.version !== build.version) flag(file, s.text);
    } else if (kind === 'page') {
      for (const t of pageTags(site.read(file))) { tags++; if (t.query !== want) flag(file, t.ref + t.query); }
    }
  }
  for (const [file, what] of off) {
    const l = Array.from(what);
    out.push('SITE-9 ' + file + ' is served with ' + l.length + ' reference(s) not at ' + want + ': ' + l.slice(0, 3).join(', ') + (l.length > 3 ? ' +' + (l.length - 3) : '')
      + '. The build stamps every relative specifier and page tag (tools/lib/version-stamp.mjs); a ?v= written in the source is a pin no release moves.');
  }
  if (floors && (specs < STAMP_FLOORS.specifiers || tags < STAMP_FLOORS.tags)) out.push('SITE-8 SITE-9 read ' + specs + ' module specifiers and ' + tags + ' page tags, under its floor of ' + STAMP_FLOORS.specifiers + ' and ' + STAMP_FLOORS.tags + ': its reader is not reading.');
  return out;
}

// ── THE BOOT PATH (SITE-10) ──────────────────────────────────────────────
export const BOOT_PAGE = 'play.html';
export const BOOT_BASELINE = join(ROOT, 'tests', 'boot-path.baseline.json');
export const BOOT_STAGES = Object.freeze(['sign-in', 'town']);
/* A cut bigger than this is red until --boot-path-write locks it in, so the ceiling follows every real cut down. */
export const BOOT_SLACK = Object.freeze({ modules: 2, gzipBytes: 4096 });
const MIN_WHY = 20;
/* Non-vacuity: a reader that found no page tag or no import measures nothing. */
const BOOT_FLOORS = Object.freeze({ 'sign-in': 4, town: 5 });

/** The files play.html itself asks for: classic and module scripts, stylesheets, preloads. { file, module }. */
export function pageLoads(html) {
  const out = [];
  for (const m of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(script|link)\b([^>]*)>/g)) {
    const attr = (k) => (new RegExp('\\b' + k + '\\s*=\\s*"([^"]*)"').exec(m[2]) || [])[1];
    const ref = m[1] === 'script' ? attr('src') : /^(?:stylesheet|preload|modulepreload)$/.test(attr('rel') || '') ? attr('href') : null;
    const file = ref && local(ref, '');
    if (file) out.push({ file, module: m[1] === 'script' ? attr('type') === 'module' : attr('rel') === 'modulepreload' });
  }
  return out;
}

/** The repository paths a served game list names (src/app/game-modules.js: the source's modules, or the bundle's chunks). */
export const gameList = (text) => Array.from(text.matchAll(/['"](src\/[^'"]+\.js)['"]/g), (m) => m[1]);

/**
 * What a player loads to the sign-in screen and to the first town, as served. Pure: the site and its import graph
 * (tools/lib/site-delivery.mjs moduleGraph) are arguments, so the proof plants a growth into either.
 * @param {{files: Map<string, number>, read: (path: string) => string}} site
 * @param {Map<string, {static: string[], dynamic: string[]}>} graph
 */
export function bootPath(site, graph) {
  const loads = pageLoads(site.read(BOOT_PAGE));
  const closure = (seed) => {
    const set = new Set(seed);
    for (const f of set) for (const t of (graph.get(f) || { static: [] }).static) set.add(t);
    return set;
  };
  const signIn = closure(loads.map((l) => l.file));
  const list = site.files.has(GAME_LIST) ? gameList(site.read(GAME_LIST)) : [];
  const town = closure([...signIn, ...list]);
  const measure = (set) => {
    const files = Array.from(set).filter((f) => site.files.has(f)).sort();
    const gzip = files.reduce((a, f) => a + gzipSync(Buffer.from(site.read(f))).length, 0);
    return { modules: files.filter((f) => f.endsWith('.js')).length, files: files.length, gzipBytes: gzip, list: files };
  };
  return { 'sign-in': measure(signIn), town: measure(town) };
}

/** The ceiling rows' last row per stage, or null when the stage was never pinned. */
const ceilingOf = (rows) => (Array.isArray(rows) && rows.length ? rows[rows.length - 1] : null);

/** SITE-10 against a baseline ({ ceilings: { stage: [{ modules, gzipBytes, on, why }] } }). */
export function bootPathProblems(measured, baseline) {
  const out = [], ceilings = (baseline && baseline.ceilings) || {};
  for (const stage of BOOT_STAGES) {
    const m = measured[stage], rows = ceilings[stage], top = ceilingOf(rows);
    if (m.modules < BOOT_FLOORS[stage]) out.push('SITE-8 SITE-10 found ' + m.modules + ' modules to the ' + stage + ' stage, under its floor of ' + BOOT_FLOORS[stage] + ': its reader is not reading.');
    if (!top) { out.push('SITE-10 the ' + stage + ' stage has no ceiling: node tools/build-site.mjs --boot-path-raise "<why>" pins it.'); continue; }
    (rows || []).forEach((r, i) => {
      const raise = i === 0 || r.modules > rows[i - 1].modules || r.gzipBytes > rows[i - 1].gzipBytes;
      if (raise && String(r.why || '').trim().length < MIN_WHY) out.push('SITE-10 the ' + stage + ' ceiling\'s row ' + (i + 1) + ' raises it with no reason (at least ' + MIN_WHY + ' characters): raise only with --boot-path-raise "<what grew and why>".');
    });
    const over = [];
    if (m.modules > top.modules) over.push(m.modules + ' modules (ceiling ' + top.modules + ')');
    if (m.gzipBytes > top.gzipBytes) over.push(kb(m.gzipBytes) + ' KB gzip (ceiling ' + kb(top.gzipBytes) + ')');
    if (over.length) out.push('SITE-10 a player now loads ' + over.join(' and ') + ' to the ' + stage + ' stage. Keep it off the boot path (an import() on need), or raise with node tools/build-site.mjs --boot-path-raise "<what grew and why>".');
    const cut = [];
    if (top.modules - m.modules > BOOT_SLACK.modules) cut.push((top.modules - m.modules) + ' modules');
    if (top.gzipBytes - m.gzipBytes > BOOT_SLACK.gzipBytes) cut.push(kb(top.gzipBytes - m.gzipBytes) + ' KB gzip');
    if (cut.length) out.push('SITE-10 the ' + stage + ' stage is ' + cut.join(' and ') + ' under its ceiling: lock the cut in with node tools/build-site.mjs --boot-path-write.');
  }
  return out;
}

// ── THE DELIVERY (SITE-11) ───────────────────────────────────────────────
/**
 * Pure: `minified` maps each minified module to { before (stamped text), after (served text), drift }; `newUrl` is every
 * `new URL('….js', import.meta.url)` target the source loads (the logical audit's SITE-2 'new URL' needs); `missing` the
 * imports of the served graph no served file answers.
 */
export function deliveryProblems({ minified = new Map(), newUrl = [], missing = [], bundled = false, sheets = new Map() }) {
  const out = [];
  for (const [file, { source, served }] of sheets) {
    if (cssUnminified(served)) out.push('SITE-11 ' + file + ' is served as written (a comment or a line break): the delivery minifies every stylesheet (tools/lib/site-delivery.mjs minifyStylesheet).');
    const want = cssRules(source), got = cssRules(served);
    const at = Array.from({ length: Math.max(want.length, got.length) }, (_, i) => i).find((i) => want[i] !== got[i]) ?? -1;
    if (at >= 0) {
      out.push('SITE-11 ' + file + ' is served with ' + got.length + ' rules where its source has ' + want.length + ', and rule ' + (at + 1) + ' differs: the source has '
        + JSON.stringify(String(want[at]).slice(0, 120)) + ', the served copy ' + JSON.stringify(String(got[at]).slice(0, 120)) + '. A stylesheet is minified by whitespace only, never merged, dropped or moved.');
    }
  }
  for (const [file, m] of minified) {
    if (m.drift) out.push('SITE-11 ' + file + ' minifies differently at the publish target than at esnext: it uses syntax the target lowers or drops (tools/lib/site-delivery.mjs TARGET / SUPPORTED).');
    const specs = (t) => moduleSpecifiers(t).map((s) => s.spec + s.query).sort().join('\n');
    if (specs(m.before) !== specs(m.after)) out.push('SITE-11 ' + file + ' lost or changed a relative specifier when minified: ' + JSON.stringify(specs(m.before).split('\n').filter((s) => !specs(m.after).split('\n').includes(s)).slice(0, 3)));
  }
  if (bundled) {
    const urls = new Set(newUrl.filter((p) => p.endsWith('.js')));
    for (const p of urls) if (!(p in RUNTIME_MODULES) && !(p in RUNTIME_FILES)) out.push('SITE-11 ' + p + ' is loaded by a URL built at run time (new URL(…, import.meta.url)) and is neither a bundle entry nor a runtime file: add it to RUNTIME_MODULES (a module) or RUNTIME_FILES (read another way) in tools/lib/site-delivery.mjs.');
    for (const p of Object.keys(RUNTIME_MODULES).concat(Object.keys(RUNTIME_FILES))) if (!urls.has(p)) out.push('SITE-11 ' + p + ' is listed as loaded by URL at run time, and nothing in the source loads it so: drop its row (tools/lib/site-delivery.mjs).');
  }
  for (const p of missing) out.push('SITE-11 the served graph imports ' + p + ', which the site does not serve.');
  return out;
}

const kb = (n) => (n / 1024).toFixed(1);
const mb = (n) => (n / 1048576).toFixed(2);
const reader = (root) => { const held = new Map(); return (p) => { if (!held.has(p)) held.set(p, readFileSync(join(root, p), 'utf8')); return held.get(p); }; };
const summary = (files, bytes) => files.size.toLocaleString('en-US') + ' files, ' + mb(bytes) + ' MB (' + Math.round(100 * bytes / SITE_BUDGET_BYTES) + '% of the ' + mb(SITE_BUDGET_BYTES) + ' MB budget)';

// ── THE BUILD ────────────────────────────────────────────────────────────
/** Empty `out` for a rebuild. Only a folder this tool built (its marker) or an empty one is ever deleted. */
function prepare(out) {
  if (out === ROOT || (ROOT + sep).startsWith(out + sep)) throw new Error(out + ' holds the repository');
  if (!existsSync(out)) return;
  if (readdirSync(out).length && !existsSync(join(out, MARKER))) throw new Error(out + ' is not a folder this tool built (no ' + MARKER + '): delete it yourself, or pick another --out');
  rmSync(out, { recursive: true });
}

/** A file as the site serves it: a module or page with the release stamp written on (SITE-9), anything else as it is. */
const served = (rel, version) => (stampKind(rel) ? Buffer.from(stampFile(rel, readFileSync(join(ROOT, rel), 'utf8'), version)) : null);

export const DELIVERIES = Object.freeze(['bundle', 'minify', 'plain']);
const sizes = (out) => new Map(walk(out, null).filter((f) => f !== MARKER).map((f) => [f, statSync(join(out, f)).size]));

/**
 * The site into `out`: the plan copied and stamped and checked (SITE-1..9), then delivered (`deliver`: tools/lib/site-delivery.mjs)
 * and checked as served (SITE-10 against `baseline` when the delivery is the default one, SITE-11).
 */
async function build(out, deliver = DELIVERIES[0], baseline = readBaseline()) {
  const plan = publishSet(), { version } = readBuild(ROOT);
  prepare(out);
  const want = new Map();
  for (const [rel, n] of plan.files) {
    mkdirSync(dirname(join(out, rel)), { recursive: true });
    const body = served(rel, version);
    if (body) writeFileSync(join(out, rel), body); else copyFileSync(join(ROOT, rel), join(out, rel));
    want.set(rel, body ? body.length : n);
  }
  writeFileSync(join(out, MARKER), 'Built by tools/build-site.mjs. This folder is deleted and rebuilt on every run.\n');
  const copied = sizes(out);
  const drift = Array.from(want).filter(([f, n]) => copied.get(f) !== n).map(([f]) => f).concat(Array.from(copied.keys()).filter((f) => !want.has(f)));
  const logical = reader(out);
  const got = audit({ ...plan, files: copied, read: logical }, await artFacts());
  if (drift.length) got.problems.unshift('the copy is not the plan: ' + drift.slice(0, 5).join(', '));

  /* THE DELIVERY: every ES module minified, then (bundle) the page's graph bundled over it */
  const esbuild = deliver === 'plain' ? null : loadEsbuild(ROOT);
  const minified = new Map();
  let bundled = null;
  if (esbuild) {
    for (const rel of copied.keys()) {
      if (minifiableCss(rel)) { writeFileSync(join(out, rel), minifyStylesheet(esbuild, readFileSync(join(ROOT, rel), 'utf8'))); continue; }
      const before = logical(rel);
      if (!minifiable(rel, before)) continue;
      const { code, drift: d, parsed } = minifyModule(esbuild, before);
      writeFileSync(join(out, rel), code);
      minified.set(rel, { before: parsed, after: code, drift: d });
    }
    if (deliver === 'bundle') {
      bundled = await bundleGame(esbuild, out, version, logical);
      for (const [rel, text] of bundled.files) { mkdirSync(dirname(join(out, rel)), { recursive: true }); writeFileSync(join(out, rel), text); minified.delete(rel); }
      writeFileSync(join(out, GAME_LIST), gameListText(bundled.game));
      minified.delete(GAME_LIST);
      writeFileSync(join(out, BOOT_PAGE), preloadBlock(logical(BOOT_PAGE), bundled.signIn.concat(GAME_LIST), version));   // the list is boot.js's static import too
    }
  }
  const files = sizes(out), read = reader(out);
  const site = { files, read };
  /* every stylesheet as served, beside its source (a stylesheet carries no stamp: the repository's file is what was copied) */
  const sheets = new Map(esbuild ? Array.from(files.keys()).filter(minifiableCss).map((rel) => [rel, { source: readFileSync(join(ROOT, rel), 'utf8'), served: read(rel) }]) : []);
  /* the served graph, from the page, the game list and the runtime entries */
  const roots = pageLoads(read(BOOT_PAGE)).filter((l) => l.module).map((l) => l.file)
    .concat(files.has(GAME_LIST) ? gameList(read(GAME_LIST)) : [], Object.keys(RUNTIME_MODULES)).filter((f, i, a) => a.indexOf(f) === i && files.has(f));
  const graphOf = esbuild || loadEsbuildOrNull();
  let boot = null;
  if (graphOf) {
    const { graph, missing } = await moduleGraph(graphOf, read, (p) => files.has(p), roots);
    boot = bootPath(site, graph);
    const newUrl = got.needs.filter((n) => n.rule === 'SITE-2' && n.via === 'new URL').map((n) => n.path);
    got.problems.push(...deliveryProblems({ minified, newUrl, missing, bundled: !!bundled, sheets }));
    if (esbuild) got.problems.push(...stampProblems(site, Array.from(files.keys()), false));   // the served stamps; the floors read the site as written
    if (deliver === DELIVERIES[0]) got.problems.push(...bootPathProblems(boot, baseline));
  }
  return { ...got, files, boot, deliver, bytes: Array.from(files.values()).reduce((a, b) => a + b, 0) };
}

/** esbuild when it is installed, else null (a --deliver plain build reads its graph only when it can). */
function loadEsbuildOrNull() { try { return loadEsbuild(ROOT); } catch { return null; } }

/** tests/boot-path.baseline.json, or an empty one. */
function readBaseline(file = BOOT_BASELINE) { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { ceilings: {} }; }

/**
 * --boot-path-raise / --boot-path-write: a new ceiling row per stage from today's measure. A raise needs a reason and
 * moves only a stage that is over (or unpinned); a write only lowers.
 */
function moveCeilings(measured, how, why) {
  const base = readBaseline(), today = new Date().toISOString().slice(0, 10), moved = [];
  base.ceilings = base.ceilings || {};
  for (const stage of BOOT_STAGES) {
    const m = measured[stage], rows = base.ceilings[stage] || (base.ceilings[stage] = []), top = ceilingOf(rows);
    const row = { modules: m.modules, gzipBytes: m.gzipBytes, on: today, why };
    if (how === 'raise' && (!top || m.modules > top.modules || m.gzipBytes > top.gzipBytes)) {
      rows.push(row);
      moved.push(stage);
    } else if (how === 'write' && top && (m.modules < top.modules || m.gzipBytes < top.gzipBytes)) {
      rows.push({ modules: Math.min(m.modules, top.modules), gzipBytes: Math.min(m.gzipBytes, top.gzipBytes), on: today, why: why || 'a cut locked in' });
      moved.push(stage);
    }
  }
  base.$comment = BASELINE_COMMENT;
  writeFileSync(BOOT_BASELINE, JSON.stringify({ $comment: base.$comment, deliver: DELIVERIES[0], ceilings: base.ceilings }, null, 2) + '\n');
  return moved;
}
const BASELINE_COMMENT = Object.freeze([
  'The boot path\'s ceilings (tools/build-site.mjs SITE-10, architecture audit 2026-11-19 item 3): the modules and the gzip bytes a player loads',
  'to the sign-in screen and to the first town, as the default delivery serves them. The ceiling is each stage\'s LAST row.',
  'It goes up only through node tools/build-site.mjs --boot-path-raise "<why>", which appends a row with its reason; --boot-path-write appends',
  'a lower row after a cut (a cut of more than BOOT_SLACK is red until it is locked in). Written by the tool, never by hand. Two lanes that both',
  'moved a ceiling conflict here: take either side and run the tool again.',
]);

function leftOut(every) {
  const plan = publishSet().files, groups = new Map(), rows = [];
  for (const f of walk(ROOT, new Set(['assets'])).filter((x) => x.includes('/') && !plan.has(x))) {
    const key = f.split('/').slice(0, f.startsWith('assets/icons-bundle/') ? 3 : 2).join('/') + '/';
    const g = groups.get(key) || { n: 0, bytes: 0 };
    g.n++; g.bytes += statSync(join(ROOT, f)).size;
    groups.set(key, g); rows.push(f);
  }
  const total = Array.from(groups.values()).reduce((a, g) => ({ n: a.n + g.n, bytes: a.bytes + g.bytes }), { n: 0, bytes: 0 });
  for (const [key, g] of Array.from(groups).sort((a, b) => b[1].bytes - a[1].bytes)) console.log(mb(g.bytes).padStart(8) + ' MB ' + String(g.n).padStart(5) + '  ' + key);
  console.log(mb(total.bytes).padStart(8) + ' MB ' + String(total.n).padStart(5) + '  left out under assets/ (still in the repository; no page, module, stylesheet or art row asks for one)');
  if (every) for (const f of rows) console.log(f);
}

// ── THE PROOF ────────────────────────────────────────────────────────────
async function selftest() {
  /* the site as the build writes it: every module and page stamped at the release (the source may carry stamps or not) */
  const plan = publishSet(), { version } = readBuild(ROOT), raw = reader(ROOT), facts = await artFacts();
  const read = (p) => stampFile(p, raw(p), version);
  const clean = audit({ ...plan, read }, facts);
  /* a real file one reader asks for: one that no other reader also asks for when there is such a file, so the named rule stands alone */
  const pick = (rule, via) => {
    const mine = clean.needs.filter((n) => n.rule === rule && n.via === via && plan.files.has(n.path));
    const others = new Set(clean.needs.filter((n) => n.rule !== rule || n.via !== via).map((n) => n.path));
    return (mine.find((n) => !others.has(n.path)) || mine[0] || {}).path;
  };
  const without = (path) => { const files = new Map(plan.files); files.delete(path); return { ...plan, files, read }; };
  /* the source of `file` gained `more`, and the build stamped it */
  const grown = (file, more, repo = plan.repo) => ({ ...plan, repo, read: (p) => (p === file ? stampFile(p, raw(p) + more, version) : read(p)) });
  /* one served file as `edit` leaves it, after the build */
  const served = (file, edit) => ({ ...plan, read: (p) => (p === file ? edit(read(p)) : read(p)) });
  const host = clean.needs.find((n) => n.rule === 'SITE-2' && n.via === 'import').by;   // any real module to plant a line into
  const near = posix.dirname(host) + '/';
  const toArt = posix.relative(posix.dirname(host), 'src/data/item-art.js').replace(/^(?!\.)/, './');
  /* an art family no PUBLISH row has heard of, as if a lane had just added its first file to the repository */
  const HORN = 'assets/sfx/horn.ogg', withHorn = plan.repo.concat(HORN);
  const hole = (name, rule, via) => { const path = pick(rule, via); return [name + (path ? ': ' + path : ''), path && without(path), facts, undefined, rule, path]; };
  const cases = [
    ['the real publish set', { ...plan, read }, facts, undefined, null],
    hole('a file a page tag names is missing', 'SITE-1', 'tag'),
    hole('a statically imported module is missing', 'SITE-2', 'import'),
    ['a module behind a literal import() is missing', grown(host, "\nimport('./never-built.js');\n"), facts, undefined, 'SITE-2', near + 'never-built.js'],
    ['a module behind new URL(…, import.meta.url) is missing', grown(host, "\nexport const BODY = new URL('./never-built.js?v=1', import.meta.url).href;\n"), facts, undefined, 'SITE-2', near + 'never-built.js'],
    hole('a stylesheet url() is missing', 'SITE-3', 'url()'),
    hole('a file a module names in a string is missing', 'SITE-4', 'string'),
    ['a module names a new file the allowlist has not heard of', grown(host, "\nexport const HORN = '<audio src=\"" + HORN + "?v=1\">';\n", withHorn), facts, undefined, 'SITE-4', HORN],
    ['a module names a new folder the allowlist has not heard of', grown(host, "\nexport const SFX_DIR = 'assets/sfx/';\n", withHorn), facts, undefined, 'SITE-4', 'assets/sfx/'],
    hole('an item icon is missing', 'SITE-5', 'item'),
    hole('a basic supply icon is missing', 'SITE-5', 'supply'),
    hole('an ability tile is missing', 'SITE-5', 'ability'),
    hole('an atlas file is missing', 'SITE-5', 'atlas'),
    ['a module wires the painted item set back', grown(host, "\nimport { wiredIconMap } from '" + toArt + "';\n"), facts, undefined, 'SITE-6', 'wiredIconMap'],
    ['the item art switch is flipped to painted', { ...plan, read }, { ...facts, artSet: 'painted' }, undefined, 'SITE-6', 'ITEM_ART_SET'],
    ['the site is a byte over its budget', { ...plan, read }, facts, clean.bytes - 1, 'SITE-7', 'budget'],
    ['a PUBLISH row that matches nothing', { ...publishSet(ROOT, PUBLISH.concat('assets/sfx/*.ogg')), read }, facts, undefined, 'SITE-8', 'assets/sfx/*.ogg'],
    ['a module reader that reads nothing', { ...plan, read: (p) => (p.endsWith('.js') ? '' : read(p)) }, facts, undefined, 'SITE-8', 'SITE-2'],
    ['a module the build left unstamped (served stale for ten minutes after a release)', served(host, (t) => stripFile(host, t)), facts, undefined, 'SITE-9', host],
    ['a specifier at another release (the b493 double load: one module, two keys, two states)', served(host, (t) => t.replace('?v=' + version, '?v=0.0.1')), facts, undefined, 'SITE-9', '?v=0.0.1'],
    ['a page whose tags the build left unstamped (the kill-switch reads the release off them)', served('play.html', (t) => stripFile('play.html', t)), facts, undefined, 'SITE-9', 'play.html'],
    ['a quoted ?v= pin in the source (b511: a cache lock no release moves)', grown(host, "\nexport const PIN = BASE + '?v=88';\n"), facts, undefined, 'SITE-9', "'?v=88'"],
    ['build-info names two releases (cache is not version)', served('src/build-info.js', (t) => t.replace(/(cache:\s*')[^']*'/, "$10.0.1'")), facts, undefined, 'SITE-9', 'says cache'],
    ['CONTROL a runtime module URL at its importer\'s own stamp (game-master.js)', grown(host, "\nexport const LATE = new URL('./" + posix.basename(host) + "', import.meta.url).href + new URL(import.meta.url).search;\n"), facts, undefined, null],
    ['CONTROL a comment that names the new file', grown(host, "\n// the horn is '" + HORN + "'\n/* under `assets/sfx/` */\n", withHorn), facts, undefined, null],
    ['CONTROL a string that names what the repository does not hold', grown(host, "\nexport const ORIGIN = ['src/never-was.js', '" + HORN + "', 'assets/voice/'];\n"), facts, undefined, null],
    ['CONTROL one more published file nothing asks for', { ...plan, files: new Map(plan.files).set('assets/ui/spare.png', 64), read }, facts, undefined, null],
  ];
  let bad = 0;
  for (const [name, site, f, budget, rule, needle] of cases) {
    if (!site) { console.log('✗ ' + name + ' → HARNESS: nothing on the real tree to plant this into'); bad++; continue; }
    const got = audit(site, f, budget).problems;
    const ok = rule === null ? got.length === 0 : got.some((p) => p.startsWith(rule + ' ') && p.includes(needle));
    if (!ok) bad++;
    console.log((ok ? '✓ ' : '✗ ') + name + ' → ' + (got[0] ? got[0].slice(0, 150) : 'GREEN') + ' (want ' + (rule || 'GREEN') + ')');
  }
  const delivered = await deliveryCases(plan, read, clean);
  bad += delivered.bad;
  if (bad) { console.error('✗ build-site --selftest: ' + bad + ' case(s) wrong'); return 1; }
  console.log('✓ build-site --selftest: all ' + (cases.length + delivered.n) + ' cases behave');
  return 0;
}

/** SITE-10 and SITE-11, planted into the site as written (its graph read by esbuild, as the build reads the served one). */
async function deliveryCases(plan, read, clean) {
  const esbuild = loadEsbuild(ROOT);
  const files = plan.files, has = (p) => files.has(p), site = { files, read };
  const roots = pageLoads(read(BOOT_PAGE)).filter((l) => l.module).map((l) => l.file).concat(gameList(read(GAME_LIST)));
  const { graph, missing } = await moduleGraph(esbuild, read, has, roots);
  const measured = bootPath(site, graph);
  const row = (m, why = 'the measure, pinned by the proof') => ({ modules: m.modules, gzipBytes: m.gzipBytes, on: '2026-11-19', why });
  const pinAt = (edit = (s, m) => m) => ({ ceilings: Object.fromEntries(BOOT_STAGES.map((s) => [s, [row(edit(s, measured[s]))]])) });
  /* the sign-in entry imports the game half statically (lane b-first-load's 520 files before the form, back) */
  const leaked = new Map(graph);
  leaked.set(ENTRY, { ...graph.get(ENTRY), static: graph.get(ENTRY).static.concat('src/app/game-half.js') });
  /* 4 KB of code the gzip cannot shrink, in a module the sign-in screen loads */
  const noise = Array.from({ length: 4096 }, (_, i) => String.fromCharCode(33 + ((i * 7919 + (i >> 3) * 104729) % 89))).join('').replace(/[`$\\]/g, 'x');
  const heavier = { files, read: (p) => (p === ENTRY ? read(p) + '\nexport const NOISE = `' + noise + '`;\n' : read(p)) };
  const planted = (p) => (p === ENTRY ? read(p) + "\nimport './never-built.js';\n" : read(p));
  const minified = (file, text) => { const m = minifyModule(esbuild, text); return new Map([[file, { before: m.parsed, after: m.code, drift: m.drift }]]); };
  const newUrl = clean.needs.filter((n) => n.rule === 'SITE-2' && n.via === 'new URL').map((n) => n.path);
  /* every published stylesheet as the delivery serves it; the planted cases change windows.css (the most rules) after the minify */
  const css = Array.from(files.keys()).filter(minifiableCss);
  const sheets = new Map(css.map((rel) => [rel, { source: read(rel), served: minifyStylesheet(esbuild, read(rel)) }]));
  const SHEET = 'src/styles/windows.css', sheet = sheets.get(SHEET) || { source: '', served: '' };
  const end = (k) => { let at = 0; for (let i = 0; i < k; i++) at = sheet.served.indexOf('}', at) + 1; return at; };   // past its k-th rule (its first rules are top-level)
  const [r1, r2, r3] = [end(1), end(2), end(3)], cut = (a, b) => sheet.served.slice(a, b);
  const servedAs = (text) => new Map(sheets).set(SHEET, { ...sheet, served: text });
  const cases = [
    ['CONTROL the boot path at its own measure', () => bootPathProblems(measured, pinAt()), null],
    ['CONTROL a cut inside the slack', () => bootPathProblems(measured, pinAt((s, m) => ({ modules: m.modules + BOOT_SLACK.modules, gzipBytes: m.gzipBytes + BOOT_SLACK.gzipBytes }))), null],
    ['the sign-in entry imports the game half statically', () => bootPathProblems(bootPath(site, leaked), pinAt()), 'SITE-10', 'to the sign-in stage'],
    ['4 KB more code the sign-in screen loads', () => bootPathProblems(bootPath(heavier, graph), pinAt()), 'SITE-10', 'KB gzip (ceiling'],
    ['a cut past the slack, not locked in', () => bootPathProblems(measured, pinAt((s, m) => ({ ...m, gzipBytes: m.gzipBytes + BOOT_SLACK.gzipBytes + 1 }))), 'SITE-10', 'lock the cut in'],
    ['a raise row with no reason', () => bootPathProblems(measured, { ceilings: { ...pinAt().ceilings, town: [row({ modules: 1, gzipBytes: 1 }), row(measured.town, '')] } }), 'SITE-10', 'no reason'],
    ['a stage never pinned', () => bootPathProblems(measured, { ceilings: { town: pinAt().ceilings.town } }), 'SITE-10', 'no ceiling'],
    ['a boot path reader that reads nothing', () => bootPathProblems(bootPath({ files, read: (p) => (p === BOOT_PAGE ? '<html></html>' : read(p)) }, new Map()), pinAt()), 'SITE-8', 'SITE-10'],
    ['CONTROL every runtime URL load the source makes is an entry or a listed file', () => deliveryProblems({ newUrl, missing, bundled: true }), null],
    ['a new runtime URL load nobody listed', () => deliveryProblems({ newUrl: newUrl.concat('src/shell/windows/never-listed.js'), bundled: true }), 'SITE-11', 'never-listed.js'],
    ['a listed runtime load the source no longer makes', () => deliveryProblems({ newUrl: newUrl.filter((p) => !(p in RUNTIME_MODULES)), bundled: true }), 'SITE-11', 'drop its row'],
    ['syntax the publish target lowers (a ||= b is ES2021)', () => deliveryProblems({ minified: minified('src/x.js', 'export let a = 0; export const f = (b) => { a ||= b; };') }), 'SITE-11', 'differently at the publish target'],
    ['CONTROL import attributes survive the target (src/world/atlas.js)', () => deliveryProblems({ minified: minified('src/x.js', "export const j = (u) => import(u, { with: { type: 'json' } });") }), null],
    ['a minified module lost a specifier', () => deliveryProblems({ minified: new Map([['src/x.js', { before: "import './a.js?v=1';", after: '', drift: false }]]) }), 'SITE-11', 'lost or changed'],
    ['the served graph imports a file the site lacks', async () => deliveryProblems({ missing: (await moduleGraph(esbuild, planted, has, [ENTRY])).missing }), 'SITE-11', 'never-built.js'],
    ['CONTROL every published stylesheet as the delivery minifies it', () => (css.length >= 10 && sheet.source ? deliveryProblems({ sheets }) : ['HARNESS ' + css.length + ' stylesheets']), null],
    ['a stylesheet served as written (the minify step gone)', () => deliveryProblems({ sheets: servedAs(sheet.source) }), 'SITE-11', SHEET + ' is served as written'],
    ['a minified stylesheet that dropped a rule', () => deliveryProblems({ sheets: servedAs(cut(0, r1) + cut(r2)) }), 'SITE-11', 'rules where its source has'],
    ['a minified stylesheet with two rules swapped (the cascade order moved)', () => deliveryProblems({ sheets: servedAs(cut(0, r1) + cut(r2, r3) + cut(r1, r2) + cut(r3)) }), 'SITE-11', 'rule 2 differs'],
    ['a minified stylesheet that lost a declaration', () => deliveryProblems({ sheets: servedAs(cut(0, r1) + cut(r1, r2).replace(/;[^;{}]*\}$/, '}') + cut(r2)) }), 'SITE-11', 'rule 2 differs'],
  ];
  let bad = 0;
  for (const [name, run, rule, needle] of cases) {
    const got = await run();
    const ok = rule === null ? got.length === 0 : got.some((p) => p.startsWith(rule + ' ') && p.includes(needle));
    if (!ok) bad++;
    console.log((ok ? '✓ ' : '✗ ') + name + ' → ' + (got[0] ? got[0].slice(0, 150) : 'GREEN') + ' (want ' + (rule || 'GREEN') + ')');
  }
  return { n: cases.length, bad };
}

// ── THE CLI ──────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args.includes('--selftest')) process.exit(await selftest());
    if (args.includes('--left-out')) { leftOut(args.includes('--all')); process.exit(0); }
    const opt = (k) => (args.includes(k) ? String(args[args.indexOf(k) + 1] || '') : null);
    const deliver = opt('--deliver') || DELIVERIES[0];
    if (!DELIVERIES.includes(deliver)) throw new Error('--deliver takes ' + DELIVERIES.join(' | ') + ', not ' + JSON.stringify(deliver));
    const raise = opt('--boot-path-raise'), lower = args.includes('--boot-path-write'), report = args.includes('--boot-path');
    if (raise !== null && raise.trim().length < MIN_WHY) throw new Error('--boot-path-raise needs its reason: what grew and why (at least ' + MIN_WHY + ' characters)');
    if ((raise !== null || lower) && deliver !== DELIVERIES[0]) throw new Error('the ceilings judge the default delivery (' + DELIVERIES[0] + ') only');
    const checkOnly = args.includes('--check') || raise !== null || lower || report;
    const out = checkOnly ? mkdtempSync(join(tmpdir(), 'hr-site-'))
      : resolve(opt('--out') ?? join(ROOT, '_site'));
    let got;
    try { got = await build(out, deliver); } finally { if (checkOnly) rmSync(out, { recursive: true, force: true }); }
    const stageLine = (b) => BOOT_STAGES.map((s) => s + ' ' + b[s].modules + ' modules / ' + b[s].files + ' files / ' + kb(b[s].gzipBytes) + ' KB gzip').join(' · ');
    if (got.boot && (report || raise !== null || lower)) {
      console.log('boot path (' + deliver + '): ' + stageLine(got.boot));
      if (args.includes('--list')) for (const s of BOOT_STAGES) console.log('  ' + s + ': ' + got.boot[s].list.join(' '));
      if (raise !== null || lower) {
        const moved = moveCeilings(got.boot, raise !== null ? 'raise' : 'write', raise !== null ? raise.trim() : null);
        console.log((moved.length ? '✓ moved the ' + moved.join(' and ') + ' ceiling(s)' : '✓ no ceiling to move') + ' in ' + BOOT_BASELINE);
        process.exit(0);
      }
    }
    for (const p of got.problems) console.error('✗ ' + p);
    if (got.problems.length) { console.error('✗ build-site: ' + got.problems.length + ' problem(s); the site is not fit to deploy'); process.exit(1); }
    const tops = new Map();
    for (const [f, n] of got.files) { const t = f.includes('/') ? f.split('/')[0] + '/' : '(root)'; tops.set(t, (tops.get(t) || 0) + n); }
    console.log('✓ build-site' + (checkOnly ? ' --check' : '') + ' (' + deliver + '): ' + summary(got.files, got.bytes) + (checkOnly ? '' : ' in ' + out));
    console.log('  ' + Array.from(tops).sort((a, b) => b[1] - a[1]).map(([t, n]) => t + ' ' + mb(n)).join(' · ') + ' · every file the pages, modules, stylesheets and art rows ask for is there, every module and page stamped ?v=' + readBuild(ROOT).version);
    if (got.boot) console.log('  boot path: ' + stageLine(got.boot) + (deliver === DELIVERIES[0] ? ' (under its ceilings, tests/boot-path.baseline.json)' : ' (not judged: the ceilings are the ' + DELIVERIES[0] + ' delivery\'s)'));
    process.exit(0);
  } catch (e) {
    console.error('✗ build-site: HARNESS: ' + (e && e.message || e));
    process.exit(2);
  }
}
