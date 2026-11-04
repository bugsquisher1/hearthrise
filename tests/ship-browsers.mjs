#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/ship-browsers.mjs — THE SITE IN FIREFOX AND WEBKIT: A TESTER PLAYS IN FIREFOX, A PHONE MEANS SAFARI.
//
//   node tests/ship-browsers.mjs [--browsers firefox,webkit] [--sites built,plain]   the rules (smoke.yml built-browsers, on Linux)
//   node tests/ship-browsers.mjs --mutate [--browsers firefox]                       every planted defect must turn its rule RED
//   --browsers chromium runs it on any machine
//
// mutant-anchors: sw.js src/platform/sw-killswitch.js
// mutant-writes-tree: no — a mutant is served by this file's own server, never written
//
// Both sites, in each browser, each from a clean profile, over a real local server with no routes (a route never sees a worker's fetches): `built` is tools/build-site.mjs's
// output, `plain` the source folder the one-step rollback serves. The server is stubbed at the edges the client really uses: supabase-js (tests/_client-harness.mjs's fake)
// and the REST paths, on the page's own origin. Files answer no-cache, so any file the HTTP cache could answer is still asked of the server: "asked nothing" can only mean the
// worker answered. The kill-switch is told this origin is production, and nothing else changes.
//   CB-1  the page boots to the sign-in form; the loading shell gives way
//   CB-2  a stubbed sign-in reaches the characters screen, Play reaches the town: the launchers are up and the world's canvas has drawn a picture, not one colour
//   CB-3  every file answered: the code (chunks, or modules), the CSS, and the town's atlases, both the JSON module (`with { type: 'json' }`: Firefox 138, Safari 17.2) and the sheet.
//         The World never said a set did not load (it would draw stubs and go on)
//   CB-4  the worker registers on this origin, controls the page and keeps this release's files under `hearthrise-<version>`
//   CB-5  the second load is the worker's: the town again, and no file the page names asked of the server. A file the first load fetched before the worker took over (the plain folder's
//         fill takes longer than the walk) is kept on this load, so the third load asks for no kept file at all
//   CB-6  no page error, no unhandled rejection, no CSP violation and no console error, on any load
//
// FIREFOX IS THE RUNNER'S OWN, stock, driven by geckodriver (both come with GitHub's ubuntu image), not Playwright's patched build: under Playwright's Firefox no navigation ever lands under
// a worker (runs 41811734716 and 41812680736: any goto, link, reload or new tab reads controller null and asks for every file), while stock Firefox 158 on the same runner and the same site
// reads controlled and asks for nothing (41813034640). WebKit is Playwright's: there is no stock WebKit for Linux.
//
// WHAT THIS CANNOT PROVE. Stock Firefox on Linux is not Firefox on Windows (the tester's): the engine and the JavaScript are the same, the disk, the GPU and the fonts are not. Playwright's WebKit is
// the Linux port, not Safari: not real iOS or macOS Safari, with their storage eviction, a worker killed in the background, their GPU and canvas limits, touch, or memory on a phone.
// Not a real CDN or real latency. It proves the code, the module graph, the JSON modules, the CSS and the worker's fetch handler run in those engines, which is where a syntax, an import
// attribute or a worker rule one engine lacks would fail. Chrome's router (`event.addRoutes`) exists in neither, so these two exercise the fetch handler alone.
// ════════════════════════════════════════════════════════════════════════
import * as playwright from 'playwright';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { ROOT, SDK_STUB } from './_client-harness.mjs';
import { buildSite } from '../tools/build-site.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.map': 'application/json', '.woff2': 'font/woff2' };
const FORM = 'form[data-auth="sign-in"]';
const PLAY = '[data-app="play"][data-slot="0"]';
const KILL_FILE = 'src/platform/sw-killswitch.js';
const WORKER_FILE = 'sw.js';
const WATCH_FILE = '/__watch.js';
const STAMP = new Date('2026-11-01T12:00:00Z').toUTCString();
const FIXTURE = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const WAIT_MS = 45000;
const MIN_COLOURS = 12;
const GECKO_PORT = 4455;
const argOf = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : fallback; };
const sleep = (ms) => new Promise((k) => setTimeout(k, ms));

/* The page's own record of what went wrong, first thing on every load (the CSP allows it: same origin). The same words in every browser, with no driver's hooks. */
const WATCH = `window.__errs = []; window.__warns = [];
addEventListener('error', (e) => { if (!e.target || !e.target.tagName) window.__errs.push('pageerror: ' + e.message); }, true);
addEventListener('unhandledrejection', (e) => window.__errs.push('rejection: ' + ((e.reason && e.reason.message) || e.reason)));
addEventListener('securitypolicyviolation', (e) => window.__errs.push('csp: ' + e.violatedDirective + ' ' + e.blockedURI));
const shownError = console.error; console.error = function () { window.__errs.push(Array.from(arguments).map(String).join(' ')); return shownError.apply(this, arguments); };
const shownWarn = console.warn; console.warn = function () { const t = Array.from(arguments).map(String).join(' '); if (/\\[world\\]|did not load/.test(t)) window.__warns.push(t); return shownWarn.apply(this, arguments); };`;

/* The API the client really calls, on the page's own origin (its project URL is rewritten below): one hero, in town. */
let answers = 1;
function answerApi(req, res, url) {
  const name = (/^\/(?:rest\/v1\/rpc|functions\/v1)\/([a-z_-]+)/.exec(url) || [])[1];
  if (!name) return false;
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const hero = name === 'hr_load' || name === 'hr-accrue';
    const body = JSON.parse(raw || '{}');
    const slot = name === 'hr_load' ? body.p_slot : body.slot;
    const answer = !hero ? { ok: true } : slot === 0 ? Object.assign({}, FIXTURE, { version: ++answers, hunt: null, client_state: {}, hero_slots: [0, 1], state: Object.assign({}, FIXTURE.state, { level_xp: 0, active_kind: null, active_id: null }), equipment: Object.assign({}, FIXTURE.equipment, { weapon: 'practice_sword' }) }) : { ok: false, error: 'no_character', hero_slots: [0, 1] };
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(name === 'hr-accrue' ? Object.assign({ accrued: true }, answer) : answer));
  });
  return true;
}

/** A local site over `root`. `plant`: { workerText, killText, fail (a path regex answering 404), append (text after the entry's code) }. */
async function serveSite(root, projectFile, entry, plant = {}) {
  const s = { log: [], port: 0, origin: '', root };
  const server = createServer((req, res) => {
    const [p, q = ''] = (req.url || '/').split('?');
    const path = decodeURIComponent(p);
    if (answerApi(req, res, path)) return;
    if (path === WATCH_FILE) { res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' }).end(WATCH); return; }
    const row = { path, q, status: 0 };
    s.log.push(row);
    const answer = (status, headers, body) => { row.status = status; res.writeHead(status, headers).end(body); };
    if (plant.fail && plant.fail.test(path)) return answer(404, { 'Cache-Control': 'no-store' }, 'planted');
    const rel = path.slice(1);
    const f = normalize(join(root, rel));
    if (!f.startsWith(normalize(root)) || !existsSync(f) || !statSync(f).isFile()) return answer(404, { 'Cache-Control': 'no-store' }, 'not found');
    const headers = { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Last-Modified': STAMP };
    let body = readFileSync(f);
    if (/\/supabase-js-[^/]+\.js$/.test(path)) body = Buffer.from(SDK_STUB);
    if (rel === 'play.html') {
      /* nothing leaves the machine: the page's one third party is a stylesheet of fonts. The watch goes first. */
      body = Buffer.from(body.toString('utf8').replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, '').replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<script src="' + WATCH_FILE + '"></script>'));
    }
    if (rel === KILL_FILE) {
      const t = plant.killText !== undefined ? plant.killText : body.toString('utf8');
      if (!t.includes("'https://hearthrise.net'")) return answer(500, {}, 'the kill-switch moved');
      body = Buffer.from(t.replace("'https://hearthrise.net'", "'" + s.origin + "'"));
    }
    if (rel === WORKER_FILE && plant.workerText !== undefined) body = Buffer.from(plant.workerText);
    if (rel === projectFile) {
      const t = body.toString('utf8');
      const here = t.replace(/url: ?(['"])https:\/\/nezapsylztqbbwuwembx\.supabase\.co\1/, 'url:globalThis.location.origin');
      if (here === t) return answer(500, {}, 'the project URL moved');
      body = Buffer.from(here);
    }
    if (rel === entry && plant.append) body = Buffer.from(body.toString('utf8') + '\n' + plant.append);
    const etag = '"' + createHash('sha1').update(body).digest('hex').slice(0, 16) + '"';
    headers.ETag = etag;
    if (req.headers['if-none-match'] === etag) return answer(304, headers);
    return answer(200, headers, body);
  });
  await new Promise((k) => server.listen(0, 'localhost', k));
  s.port = server.address().port;
  s.origin = 'http://localhost:' + s.port;
  s.close = () => new Promise((k) => { server.close(k); server.closeAllConnections(); });
  return s;
}

// ── TWO WAYS TO DRIVE A BROWSER, ONE WALK ───────────────────────────────
/* Playwright, for its WebKit and (on any machine) its Chromium. A page is a fresh context. */
async function playwrightDriver(name) {
  const browser = await playwright[name].launch({ headless: true });
  return {
    version: () => browser.version(),
    async newPage() {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await ctx.newPage();
      page.setDefaultTimeout(WAIT_MS);
      return { goto: (url) => page.goto(url, { waitUntil: 'commit' }), eval: (fn, arg) => page.evaluate(fn, arg), click: (q) => page.click(q), fill: (q, v) => page.fill(q, v), close: () => ctx.close().catch(() => {}) };
    },
    close: () => browser.close().catch(() => {}),
  };
}

/* The runner's stock Firefox over WebDriver. A page is a fresh session, so a fresh profile. */
async function geckoDriver() {
  const child = spawn('geckodriver', ['--port', String(GECKO_PORT)], { stdio: 'ignore' });
  const gone = new Promise((_, no) => child.on('error', (e) => no(new Error('no geckodriver on this machine (GitHub\'s ubuntu image has it; --browsers chromium runs anywhere): ' + e.message))));
  const base = 'http://127.0.0.1:' + GECKO_PORT;
  const call = async (path, body, method) => {
    const res = await fetch(base + path, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await res.json();
    if (j.value && j.value.error) throw new Error(j.value.error + ': ' + j.value.message);
    return j.value;
  };
  const up = (async () => { for (let i = 0; i < 100; i++) { try { if ((await call('/status')).ready) return; } catch (e) { /* not yet */ } await sleep(100); } throw new Error('geckodriver never answered'); })();
  await Promise.race([up, gone]);
  let version = '';
  return {
    version: () => version,
    async newPage() {
      const made = await call('/session', { capabilities: { alwaysMatch: { browserName: 'firefox', 'moz:firefoxOptions': { args: ['-headless', '--width=1280', '--height=720'] } } } });
      version = made.capabilities.browserVersion;
      const at = '/session/' + made.sessionId;
      await call(at + '/timeouts', { script: WAIT_MS, implicit: WAIT_MS });
      const element = async (q) => Object.values(await call(at + '/element', { using: 'css selector', value: q }))[0];
      return {
        goto: (url) => call(at + '/url', { url }),
        async eval(fn, arg) {
          const r = await call(at + '/execute/async', { args: [arg === undefined ? null : arg],
            script: 'const done = arguments[arguments.length - 1]; Promise.resolve().then(() => (' + fn.toString() + ')(arguments[0])).then((ok) => done({ ok: ok === undefined ? null : ok }), (e) => done({ no: String(e) }));' });
          if (r && r.no) throw new Error(r.no);
          return r ? r.ok : r;
        },
        click: async (q) => call(at + '/element/' + await element(q) + '/click', {}),
        fill: async (q, v) => call(at + '/element/' + await element(q) + '/value', { text: v }),
        close: () => call(at, undefined, 'DELETE').catch(() => {}),
      };
    },
    close: async () => { child.kill(); await sleep(200); },
  };
}

const driverFor = (name) => (name === 'firefox' ? geckoDriver() : playwrightDriver(name));

const until = async (d, fn, arg, ms = WAIT_MS) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(150)) {
    try { if (await d.eval(fn, arg)) return true; } catch (e) { /* the page is on its way to the next load */ }
  }
  return false;
};
/* How many different colours the world's canvas holds, sampled: one colour is a canvas nothing drew on. */
const canvasColours = () => {
  const c = document.querySelector('canvas.world-canvas');
  if (!c || !c.width || !c.height) return 0;
  const small = document.createElement('canvas');
  small.width = 64; small.height = 36;
  const x = small.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(c, 0, 0, 64, 36);
  const d = x.getImageData(0, 0, 64, 36).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  return seen.size;
};
const atTown = () => !!(document.querySelector('.hs-launchers') && document.querySelector('canvas.world-canvas'));

/* One browser, one site. `rules`: only these are judged (a mutant's), and the walk ends once they have been. It also stops where a later rule could not mean anything. */
async function walkSite(browserName, driver, st, s, version, fails, rules) {
  const want = (r) => !rules || rules.includes(r);
  const tag = '[' + browserName + ' ' + st.name + '] ';
  const fail = (rule, words) => { if (want(rule)) fails.push(rule + ' ' + tag + words); };
  const d = await driver.newPage();
  const errors = [], warned = [];
  /* each load's record, read before the page goes */
  const collect = async () => { const r = await d.eval(() => ({ errs: window.__errs || [], warns: window.__warns || [] })).catch(() => ({ errs: [], warns: [] })); errors.push(...r.errs); warned.push(...r.warns); };
  const said = () => errors.slice(0, 2).join(' | ');
  try {
    await d.goto(s.origin + '/play.html');
    if (!(await until(d, (q) => document.querySelector(q) && !document.querySelector('.boot-shell'), FORM))) { await collect(); fail('CB-1', 'no sign-in form: ' + JSON.stringify(String(await d.eval(() => document.body.innerText).catch(() => '')).slice(0, 160)) + ' ' + said()); return; }
    await d.fill('input[name=email]', 'qa@example.test');
    await d.fill('input[name=password]', 'not-a-real-password');
    await d.click('.auth-submit');
    if (!(await until(d, (q) => !!document.querySelector(q), PLAY))) { await collect(); fail('CB-2', 'the stubbed sign-in did not reach the characters screen: ' + said()); return; }
    await d.click(PLAY);
    if (!(await until(d, atTown))) { await collect(); fail('CB-2', 'Play did not reach the town: ' + said()); return; }
    let colours = 0;
    for (const end = Date.now() + 30000; Date.now() < end && colours < MIN_COLOURS; await sleep(300)) colours = await d.eval(canvasColours).catch(() => 0);
    if (colours < MIN_COLOURS) fail('CB-2', 'the world\'s canvas holds ' + colours + ' colour(s): nothing was drawn');
    await collect();
    if (rules && rules.includes('CB-2')) return;

    /* CB-3: what the first load asked for */
    const ok = (re) => s.log.filter((r) => re.test(r.path) && (r.status === 200 || r.status === 304));
    if (ok(st.codeFile).length < 3) fail('CB-3', 'the code: only ' + ok(st.codeFile).length + ' file(s) answered');
    if (!ok(/\.css$/).length) fail('CB-3', 'no stylesheet answered');
    for (const set of ['common', 'havora', 'hunt']) {
      if (!ok(st.atlasOf(set, 'json')).length) fail('CB-3', 'the JSON module of atlas ' + set + ' was never answered');
      if (!ok(st.atlasOf(set, 'png')).length) fail('CB-3', 'the sheet of atlas ' + set + ' was never answered');
    }
    /* the JSON module parsed: the World says so when one does not load */
    if (warned.length) fail('CB-3', 'the World: ' + warned.slice(0, 2).join(' | '));
    const bad = s.log.filter((r) => r.status >= 400);
    if (bad.length) fail('CB-3', bad.length + ' file(s) refused: ' + bad.slice(0, 4).map((r) => r.path + ' ' + r.status).join(', '));
    if (rules && rules.includes('CB-3')) return;

    /* CB-4: the worker */
    const active = await until(d, async (v) => {
      if (!('serviceWorker' in navigator)) return false;
      const r = await navigator.serviceWorker.getRegistration();
      return !!(r && r.active && r.active.state === 'activated' && !r.installing && !r.waiting && r.active.scriptURL.endsWith('sw.js?v=' + v) && navigator.serviceWorker.controller);
    }, version);
    const held = await d.eval(async () => ({ secure: window.isSecureContext, hasWorker: 'serviceWorker' in navigator, hasCaches: 'caches' in window, keys: 'caches' in window ? await caches.keys() : [] }));
    if (!active) { fail('CB-4', 'no active worker controls the page: ' + JSON.stringify(held) + ' ' + said()); return; }
    if (held.keys.join() !== 'hearthrise-' + version) fail('CB-4', 'caches: ' + held.keys.join());
    const kept = await d.eval(async (name) => (await (await caches.open(name)).keys()).length, 'hearthrise-' + version);
    if (kept < 5) fail('CB-4', 'the worker keeps only ' + kept + ' file(s)');

    /* CB-5: the next loads. A navigation, never a reload: a reload asks for a fresh copy, and the worker rightly lets that through (tests/return-load.mjs RL-4). */
    const isKept = (r) => (r.path.startsWith('/a/') && !r.path.endsWith('.map')) || (new URLSearchParams(r.q).has('v') && r.path !== '/' + KILL_FILE && r.path !== '/sw.js');
    const again = async (label) => {
      await sleep(500);   // what the last load's page was still fetching has landed, and been kept
      s.log.length = 0;
      await d.goto(s.origin + '/play.html');
      if (!(await until(d, atTown))) { await collect(); fail('CB-5', 'the ' + label + ' load did not reach the town: ' + said()); return false; }
      await sleep(500);
      await collect();
      if (!(await d.eval(() => !!navigator.serviceWorker.controller))) fail('CB-5', 'the ' + label + ' load is not controlled');
      if (!s.log.some((r) => r.path === '/play.html')) fail('CB-5', 'CONTROL: the ' + label + ' load never asked for its page');
      return true;
    };
    const named = new Set([...readFileSync(join(s.root, 'play.html'), 'utf8').matchAll(/\b(?:src|href)="([^"?]+)/g)].map((m) => '/' + m[1]));
    if (!(await again('second'))) return;
    const namedAsked = s.log.filter((r) => isKept(r) && named.has(r.path));
    if (namedAsked.length) fail('CB-5', 'the second load asked the server for ' + namedAsked.length + ' file(s) the page names: ' + namedAsked.slice(0, 4).map((r) => r.path).join(', '));
    if (!(await again('third'))) return;
    const keptAsked = s.log.filter(isKept);
    if (keptAsked.length) fail('CB-5', 'the third load asked the server for ' + keptAsked.length + ' kept file(s): ' + keptAsked.slice(0, 4).map((r) => r.path).join(', '));
    if (errors.length) fail('CB-6', errors.length + ' error(s): ' + errors.slice(0, 3).join(' | '));
  } finally { await d.close(); }
}

let built = null;
async function sitesOf(names) {
  if (names.includes('built') && !built) built = await buildSite({ out: join(ROOT, 'dist') });
  const version = /\bversion:\s*'(\d+\.\d+\.\d+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8'))[1];
  const row = {
    built: () => ({ name: 'built', root: built.out, entry: built.entry, projectFile: JSON.parse(readFileSync(join(built.out, 'build-map.json'), 'utf8')).modules['src/net/supabase-bootstrap.js'],
      codeFile: /^\/a\/(boot|c)-[A-Z0-9]{8}\.js$/, atlasOf: (set, ext) => new RegExp('^/a/atlas-' + set + '-[0-9a-f]{10}\\.' + ext + '$') }),
    plain: () => ({ name: 'plain', root: ROOT, entry: 'src/app/boot.js', projectFile: 'src/net/supabase-bootstrap.js',
      codeFile: /^\/src\/(app|session|shell|world|core|data)\//, atlasOf: (set, ext) => new RegExp('^/assets/world/atlas-' + set + '\\.' + ext + '$') }),
  };
  return { version, sites: names.map((n) => row[n]()) };
}

/** The walk, per browser and site. Answers the failures. */
async function checks({ browsers, siteNames, plant, rules }) {
  const fails = [];
  const { version, sites } = await sitesOf(siteNames);
  for (const name of browsers) {
    let driver = null;
    try {
      driver = await driverFor(name);
      for (const st of sites) {
        const s = await serveSite(st.root, st.projectFile, st.entry, plant);
        const t0 = Date.now();
        try { await walkSite(name, driver, st, s, version, fails, rules); } catch (e) { fails.push('HARNESS [' + name + ' ' + st.name + '] ' + (e && e.stack || e)); } finally { await s.close(); }
        if (!rules) console.log('  ' + name + ' ' + driver.version() + ' ' + st.name + ': ' + Math.round((Date.now() - t0) / 1000) + ' s');
      }
    } catch (e) { fails.push('HARNESS [' + name + '] ' + (e && e.message || e)); } finally { if (driver) await driver.close(); }
  }
  return fails;
}

const readSource = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
/* [name, the one rule that must go red, the plant, the anchor it needs] */
const MUTANTS = [
  ['the worker keeps nothing', 'CB-5', () => ({ workerText: readSource(WORKER_FILE).replace('const isKept = (url) => isNamed(url) || atVersion(url);', 'const isKept = () => false;') }), [WORKER_FILE, 'const isKept = (url) => isNamed(url) || atVersion(url);']],
  ['no worker is ever registered', 'CB-4', () => ({ killText: readSource(KILL_FILE).replace("navigator.serviceWorker.register('sw.js?v=' + BUILD, { scope: 'play.html' })", "Promise.resolve('sw.js?v=' + BUILD)") }), [KILL_FILE, "navigator.serviceWorker.register('sw.js?v=' + BUILD, { scope: 'play.html' })"]],
  ['an atlas\'s JSON module is missing', 'CB-3', () => ({ fail: /atlas-common[^/]*\.json$/ })],
  ['a sheet is missing', 'CB-3', () => ({ fail: /atlas-hunt[^/]*\.png$/ })],
  ['the stylesheet is missing', 'CB-3', () => ({ fail: /\.css$/ })],
  ['nothing draws on the canvas', 'CB-2', () => ({ append: 'CanvasRenderingContext2D.prototype.drawImage=function(){};CanvasRenderingContext2D.prototype.fillRect=function(){};' })],
  ['the page throws', 'CB-6', () => ({ append: "setTimeout(()=>{throw new Error('planted')},0);" })],
  ['the entry does not load', 'CB-1', () => ({ fail: /^\/a\/boot-/ })],
];

async function mutate(browsers) {
  const one = [browsers[0]];
  let bad = 0;
  const clean = await checks({ browsers: one, siteNames: ['built'] });
  if (clean.length) { for (const f of clean) console.log('  ✗ clean control: ' + f.slice(0, 300)); console.log('ship-browsers --mutate: the clean control is RED'); return 1; }
  console.log('  ✓ clean control green [' + one[0] + ' built]');
  for (const [name, rule, plantOf, anchor] of MUTANTS) {
    if (anchor && !readSource(anchor[0]).includes(anchor[1])) { console.log('  ✗ ' + name + ': the anchor moved: ' + anchor[1]); bad++; continue; }
    const t0 = Date.now();
    const fails = await checks({ browsers: one, siteNames: ['built'], plant: plantOf(), rules: [rule] });
    const caught = fails.some((f) => f.startsWith(rule + ' '));
    console.log('  ' + (caught ? '✓' : '✗') + ' ' + name + ' [' + rule + '] ' + Math.round((Date.now() - t0) / 1000) + ' s' + (caught ? '' : ': ' + (fails.join(' | ').slice(0, 240) || 'stayed green')));
    if (!caught) bad++;
  }
  console.log(bad ? 'ship-browsers --mutate: ' + bad + ' of ' + MUTANTS.length + ' missed' : 'ship-browsers --mutate: all ' + MUTANTS.length + ' caught');
  return bad ? 1 : 0;
}

const browsers = String(argOf('browsers', 'firefox,webkit')).split(',');
let code = 1;
if (process.argv.includes('--mutate')) code = await mutate(browsers);
else {
  const t0 = Date.now();
  const fails = await checks({ browsers, siteNames: String(argOf('sites', 'built,plain')).split(',') });
  for (const f of fails) console.log('  ✗ ' + f);
  console.log(fails.length ? 'ship-browsers: ' + fails.length + ' RED' : 'ship-browsers: ' + browsers.join(' and ') + ': both sites boot, sign in, reach the town, load their atlases, and later loads are the worker\'s; ' + Math.round((Date.now() - t0) / 1000) + ' s');
  code = fails.length ? 1 : 0;
}
process.exit(code);
