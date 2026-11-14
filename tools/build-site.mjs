#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/build-site.mjs — THE SITE IS WHAT THE GAME LOADS, NOT THE REPOSITORY.
//
//   node tools/build-site.mjs [--out DIR]   copy the publish set into _site/ (or DIR), check the copy, print its size
//   node tools/build-site.mjs --check       the same build into a scratch folder, removed after (the smoke.yml guard)
//   node tools/build-site.mjs --left-out    what stays behind under assets/, by folder (--all: every file)
//   node tools/build-site.mjs --selftest    planted holes must go RED by their own rule, the real set GREEN
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
import { lex } from './guard-anchors.mjs';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// THE PUBLISH SET: one row per reason a browser asks. A star stays inside one folder; two stars and a slash are any depth.
export const PUBLISH = Object.freeze([
  '*.html',                                                  // the pages at the root: the notice and the game
  'CNAME',                                                   // the custom domain (a branch deploy reads it; kept for the rollback)
  'src/**/*.js', 'src/**/*.css',                             // every module and stylesheet
  'assets/brand/hearthrise-crest.png',                       // the loading shell, the sign-in screens, the notice
  'assets/brand/hearthrise-mark.png',                        // the tab icon
  'assets/brand/og-image.png',                               // the link preview
  'assets/ui/*.png',                                         // the frames and plates the stylesheets draw
  'assets/world/atlas-*.png', 'assets/world/atlas-*.json',   // the world atlases and their manifests
  'assets/icons-bundle/pixel/items/*.png',                   // one 32 px icon per item row
  'assets/icons-bundle/pixel/abilities/*.png',               // one tile per ability
  'assets/icons-bundle/pixel/supplies/*.png',                // one icon per basic supply
  'assets/icons-bundle/pixel/heads/*.png',                   // one 32 px head per creature
  'legal/PRIVACY_POLICY.md', 'legal/TERMS_OF_SERVICE.md',    // read by the sign-in screens
]);

/* NAMED BY THE CODE, LEFT OUT ON PURPOSE: the painted item and monster sets (590 files, 22 MB). Their folders are
   constants in the two art manifests, but ITEM_ART_SET is 'pixel' and no module imports a name that builds a painted
   path, so no screen asks for one. SITE-6 holds exactly that: wire one back and the build is red until its folder is
   a PUBLISH row. `names` are the exports of each manifest that never reach a painted folder. */
export const LEFT_OUT = Object.freeze({
  prefixes: Object.freeze(['assets/icons-bundle/hearthfire/', 'assets/icons-bundle/painted/']),
  names: Object.freeze({
    'item-art.js': Object.freeze(['PIXEL_DIR', 'ABILITY_DIR', 'ABILITY_ART', 'SUPPLY_DIR', 'SUPPLY_ART_AHEAD', 'ITEM_ART_AHEAD', 'ITEM_ART_SET', 'fileFor']),
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
  return { problems, needs, bytes };
}

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

async function build(out) {
  const plan = publishSet();
  prepare(out);
  for (const rel of plan.files.keys()) { mkdirSync(dirname(join(out, rel)), { recursive: true }); copyFileSync(join(ROOT, rel), join(out, rel)); }
  writeFileSync(join(out, MARKER), 'Built by tools/build-site.mjs. This folder is deleted and rebuilt on every run.\n');
  const copied = new Map(walk(out, null).filter((f) => f !== MARKER).map((f) => [f, statSync(join(out, f)).size]));
  const drift = Array.from(plan.files).filter(([f, n]) => copied.get(f) !== n).map(([f]) => f).concat(Array.from(copied.keys()).filter((f) => !plan.files.has(f)));
  const got = audit({ ...plan, files: copied, read: reader(out) }, await artFacts());
  if (drift.length) got.problems.unshift('the copy is not the plan: ' + drift.slice(0, 5).join(', '));
  return { ...got, files: copied };
}

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
  const plan = publishSet(), read = reader(ROOT), facts = await artFacts();
  const clean = audit({ ...plan, read }, facts);
  /* a real file one reader asks for: one that no other reader also asks for when there is such a file, so the named rule stands alone */
  const pick = (rule, via) => {
    const mine = clean.needs.filter((n) => n.rule === rule && n.via === via && plan.files.has(n.path));
    const others = new Set(clean.needs.filter((n) => n.rule !== rule || n.via !== via).map((n) => n.path));
    return (mine.find((n) => !others.has(n.path)) || mine[0] || {}).path;
  };
  const without = (path) => { const files = new Map(plan.files); files.delete(path); return { ...plan, files, read }; };
  const grown = (file, more, repo = plan.repo) => ({ ...plan, repo, read: (p) => (p === file ? read(p) + more : read(p)) });
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
  if (bad) { console.error('✗ build-site --selftest: ' + bad + ' case(s) wrong'); return 1; }
  console.log('✓ build-site --selftest: all ' + cases.length + ' cases behave');
  return 0;
}

// ── THE CLI ──────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args.includes('--selftest')) process.exit(await selftest());
    if (args.includes('--left-out')) { leftOut(args.includes('--all')); process.exit(0); }
    const checkOnly = args.includes('--check');
    const out = checkOnly ? mkdtempSync(join(tmpdir(), 'hr-site-'))
      : resolve(args.includes('--out') ? String(args[args.indexOf('--out') + 1] || '') : join(ROOT, '_site'));
    let got;
    try { got = await build(out); } finally { if (checkOnly) rmSync(out, { recursive: true, force: true }); }
    for (const p of got.problems) console.error('✗ ' + p);
    if (got.problems.length) { console.error('✗ build-site: ' + got.problems.length + ' problem(s); the site is not fit to deploy'); process.exit(1); }
    const tops = new Map();
    for (const [f, n] of got.files) { const t = f.includes('/') ? f.split('/')[0] + '/' : '(root)'; tops.set(t, (tops.get(t) || 0) + n); }
    console.log('✓ build-site' + (checkOnly ? ' --check' : '') + ': ' + summary(got.files, got.bytes) + (checkOnly ? '' : ' in ' + out));
    console.log('  ' + Array.from(tops).sort((a, b) => b[1] - a[1]).map(([t, n]) => t + ' ' + mb(n)).join(' · ') + ' · every file the pages, modules, stylesheets and art rows ask for is there');
    process.exit(0);
  } catch (e) {
    console.error('✗ build-site: HARNESS: ' + (e && e.message || e));
    process.exit(2);
  }
}
