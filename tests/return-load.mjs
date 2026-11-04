#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/return-load.mjs — COMING BACK AFTER TEN MINUTES IS NOT THE SLOWEST LOAD IN THE GAME.
//
//   node tests/return-load.mjs           the rules, a real Chromium over a local Pages-like server
//   node tests/return-load.mjs --mutate  every planted defect must turn a rule RED
//
// mutant-anchors: sw.js src/platform/sw-killswitch.js src/platform/load-shell.js
// mutant-writes-tree: no — mutants are served by this file's own server, never written
//
// GitHub Pages sends max-age=600 with no way to change it, and every site file is immutable by its `?v=` (tests/site-files-immutable.mjs). So
// sw.js keeps them, and only those. MEASURED 2026-11-04 to the sign-in form, real Chrome, Tyler's PC with other lanes on it:
//   live, no worker, back after 11 min  1.43 s with the PC free, 12.95 s and 62.3 s with it busy: 395 requests, each a disk read, a CDN round
//                                       trip and a disk write; 112 of them whole files, as Pages' servers stamp one file's etag a second apart.
//                                       (Playwright's headless shell on Windows: 4-21 s, mostly a WinHTTP proxy lookup per request, 4 at a time, p50
//                                       queue 4.8 s; real Chrome makes no such lookup. Do not judge load times by that browser on this PC.)
//   a local copy of Pages (h2, etags, those stamps), no worker -> worker: 0.95-1.25 -> 0.36-0.48 s; 4G 2.0 -> 0.55-0.6 s; the PC busy 11.4-12.2 ->
//                                       0.54-0.71 s; 393 requests -> 6. 4x slower CPU + 4G 2.3 -> 2.1-2.4 s: there the page's own work is the load.
//                                       A reload inside the ten minutes pays a little: 0.2 -> 0.25-0.34 s.
//
// The server here behaves as Pages does: a short max-age, etags, a Last-Modified per deploy, a page that names every file by version.
// No Playwright routes anywhere: they turn the HTTP cache off and never see a worker's fetches. Other hosts do not resolve. The worker
// runs here because this server serves src/platform/sw-killswitch.js with this origin in place of the production one, and nothing else
// changes; RL-1 is the same page with that left alone.
//   RL-1  any other origin runs with no worker: no registration, no cache, sw.js never asked for
//   RL-2  the first visit fills the cache with every versioned file the page names, downloading none twice; the page ends up controlled
//   RL-3  BACK AFTER THE EXPIRY: the sign-in form, and not one versioned file asked of the server, except the brake; the page's HTML always
//         is; the loading bar still moves when the worker answers; zero console errors
//   RL-4  NOT ITS BUSINESS, with Chrome's router and without it: a page's HTML at a version, another version, no version, another host, a
//         POST, a request for a fresh copy, part of a file: each reaches the server every time and none is kept
//   RL-5  THE RELEASE FLIP: old `?v=` cached, new HTML, the new version's files and bytes are what runs, no old file asked for, no reload;
//         the old cache is gone with only the new one left, and the next return asks for nothing
//   RL-6  `?reset-sw=1` wipes every cache and the worker, reloads once, leaves the URL clean; that tab stays clean, a new tab registers again
//   RL-7  a worker or a cache that is not this site's is wiped, as ever
//   RL-8  THE BRAKE: a release with WORKER_ON = false wipes a player who holds the worker, and none comes back
//   RL-9  A FAILURE IS THE NETWORK'S TURN: storage that refuses or never answers, the form still comes; a 503 on a file is not kept and the
//         page's own retry brings it back; an error status is never kept
//   RL-10 the loading shell's Reload press, with a worker in the way, starts clean
//   RL-11 old bytes under a new version (a CDN answering late around a deploy) are not kept, and are once the right ones answer
//   RL-12 a worker whose page does not name its version does not take over; the next load's registration does
//   RL-13 the notice page is not the worker's: not controlled, and visiting it leaves the worker alone
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { leaseBrowser } from './_chrome.mjs';
import { ROOT } from './_client-harness.mjs';

const PROD_ORIGIN = "'https://hearthrise.net'";
const REAL = /version:\s*'(\d+\.\d+\.\d+)'/.exec(await readFile(join(ROOT, 'src/build-info.js'), 'utf8'))[1];
const NEXT = '9.9.9';
const BRAKE = '/src/platform/sw-killswitch.js';
const KILL_FILE = 'src/platform/sw-killswitch.js';
const WORKER_FILE = 'sw.js';
const MAX_AGE = 1;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const TEXT = new Set(['.html', '.js', '.css', '.json', '.svg']);
const FORM = 'form[data-auth="sign-in"]';
const DEPLOY_1 = Date.parse('2026-11-01T12:00:00Z');
const DEPLOY_2 = Date.parse('2026-11-02T12:00:00Z');
const sleep = (ms) => new Promise((k) => setTimeout(k, ms));
const expiry = () => sleep(MAX_AGE * 1000 + 400);

/* A local GitHub Pages. s.* is the deploy this server has; the rules move it. */
async function site(overrides) {
  const s = { version: REAL, deploy: DEPLOY_1, on: true, brakeOff: false, log: [], failing: new Map(), oldBytes: new Set(), workerPageAt: null, workerPrefix: '', extra: {} };
  const cached = new Map();
  async function raw(rel) {
    if (s.extra[rel] !== undefined) return Buffer.from(s.extra[rel]);
    if (overrides && overrides[rel] !== undefined) return Buffer.from(overrides[rel]);
    if (!cached.has(rel)) cached.set(rel, await readFile(join(ROOT, rel)));
    return cached.get(rel);
  }
  function atVersion(rel, buf, version) {
    if (!TEXT.has(extname(rel))) return buf;
    let t = buf.toString('utf8');
    if (version !== REAL) {
      t = t.split('?v=' + REAL).join('?v=' + version);
      if (rel === 'src/build-info.js') t = t.split("'" + REAL + "'").join("'" + version + "'");
    }
    if (rel === KILL_FILE) {
      if (!t.includes(PROD_ORIGIN)) throw new Error('the kill-switch no longer names the production origin');
      if (s.on) t = t.replace(PROD_ORIGIN, "'http://127.0.0.1:" + s.port + "'");
      if (s.brakeOff) t = t.replace('var WORKER_ON = true;', 'var WORKER_ON = false;');
    }
    if (rel === WORKER_FILE) t = s.workerPrefix + t;
    if (s.noCsp && rel === 'play.html') t = t.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
    return Buffer.from(t);
  }
  const server = createServer(async (req, res) => {
    const [p, q = ''] = (req.url || '/').split('?');
    const path = decodeURIComponent(p === '/' ? '/index.html' : p);
    const row = { path, q, method: req.method, dest: req.headers['sec-fetch-dest'], status: 0 };
    s.log.push(row);
    const answer = (status, headers, body) => { row.status = status; res.writeHead(status, headers).end(body); };
    try {
      const left = s.failing.get(path) || 0;
      if (left > 0) { s.failing.set(path, left - 1); return answer(503, { 'Cache-Control': 'no-store' }, 'try later'); }
      const f = normalize(join(ROOT, path));
      if (!f.startsWith(ROOT)) return answer(403, {}, '');
      const rel = f.slice(ROOT.length + 1).split('\\').join('/');
      if (s.extra[rel] === undefined && !(await stat(f).catch(() => null))) return answer(404, { 'Cache-Control': 'no-store' }, 'not found');
      const old = s.oldBytes.has(path);
      const version = old ? REAL : (path === '/play.html' && req.headers['sec-fetch-dest'] === 'empty' && s.workerPageAt) || s.version;
      const body = atVersion(rel, await raw(rel), version);
      const stamp = old ? DEPLOY_1 : s.deploy;
      const etag = '"' + createHash('sha1').update(body).update(String(stamp)).digest('hex').slice(0, 16) + '"';
      const fresh = (q.startsWith('v=') || (path.endsWith('.html') && !s.pageNoStore)) && path !== '/probe.js';
      const headers = { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': fresh ? 'max-age=' + MAX_AGE : 'no-store',
        ETag: etag, 'Last-Modified': new Date(stamp).toUTCString(), Vary: 'Accept-Encoding' };
      if (req.method === 'GET' && req.headers['if-none-match'] === etag) return answer(304, headers);
      return answer(200, headers, body);
    } catch (e) { return answer(500, {}, String(e && e.message)); }
  });
  await new Promise((k) => server.listen(0, '127.0.0.1', k));
  s.port = server.address().port;
  s.base = 'http://127.0.0.1:' + s.port;
  s.close = () => new Promise((k) => { server.close(k); server.closeAllConnections(); });
  return s;
}

const versioned = (rows) => rows.filter((r) => /(^|&)v=/.test(r.q) && r.path !== '/sw.js');
const names = (rows) => rows.map((r) => r.path + '?' + r.q).slice(0, 5).join(', ');

/* poll, for a page that may reload under the wait */
async function until(page, fn, arg, ms = 30000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(120)) {
    try { const v = await page.evaluate(fn, arg); if (v) return v; } catch (e) { /* on its way to the next load */ }
  }
  return null;
}
const workerAt = (page, version) => until(page, async (v) => {
  const r = await navigator.serviceWorker.getRegistration();
  return !!(r && r.active && r.active.state === 'activated' && !r.installing && !r.waiting && r.active.scriptURL.endsWith('sw.js?v=' + v));
}, version, 120000);
const stateOf = (page) => page.evaluate(async () => {
  const keys = await caches.keys();
  const out = { keys, regs: (await navigator.serviceWorker.getRegistrations()).map((r) => (r.active || r.waiting || r.installing || {}).scriptURL || ''), controlled: !!navigator.serviceWorker.controller,
    purged: sessionStorage.getItem('hr-sw-purged'), kept: [] };
  for (const k of keys) for (const q of await (await caches.open(k)).keys()) out.kept.push(q.url.replace(location.origin + '/', ''));
  return out;
});
const named = (html, version) => [...new Set([...html.matchAll(/\b(?:href|src)="([^"]+\?v=[^"]+)"/g)].map((m) => m[1]))].filter((u) => !/^https?:/.test(u) && u.endsWith('?v=' + version));
const keptEveryFile = async (s, st, version) => {
  const html = (await readFile(join(ROOT, 'play.html'), 'utf8')).split('?v=' + REAL).join('?v=' + version);
  const want = named(html, version).filter((u) => !u.startsWith(BRAKE.slice(1)));
  const missing = want.filter((u) => !st.kept.includes(u));
  return { want, missing };
};

/* ── THE RULES: each its own context (its own HTTP cache, workers and storage). ── */
const RULES = {
  async 'RL-1'(open) {
    const { page, s } = await open({ on: false });
    await s.visit(page);
    await page.waitForLoadState('load');
    await sleep(800);
    const st = await stateOf(page);
    if (st.regs.length || st.keys.length) return 'another origin got a worker or a cache: ' + JSON.stringify([st.regs, st.keys]);
    if (s.log.some((r) => r.path === '/sw.js')) return 'sw.js was asked for on another origin';
    return true;
  },
  async 'RL-2'(open) {
    const { page, s } = await open();
    await s.visit(page);
    if (!(await workerAt(page, REAL))) return 'no worker after the first visit';
    const st = await stateOf(page);
    if (st.keys.join() !== 'hearthrise-' + REAL) return 'the cache is not named for the version: ' + st.keys.join();
    const { want, missing } = await keptEveryFile(s, st, REAL);
    if (want.length < 300) return 'the page names only ' + want.length + ' files: this rule measures nothing';
    if (missing.length) return missing.length + ' files the page names are not kept: ' + missing.slice(0, 3).join(', ');
    if (st.kept.some((u) => /\.html/.test(u))) return 'a page\'s HTML was kept';
    if (st.kept.includes(BRAKE.slice(1) + '?v=' + REAL)) return 'the brake was kept';
    if (!st.controlled) return 'the page is not controlled once the worker is active';
    const counts = {};
    for (const r of versioned(s.log)) if (r.status === 200) counts[r.path] = (counts[r.path] || 0) + 1;
    const twice = Object.keys(counts).filter((k) => counts[k] > 1);
    return !twice.length || 'the fill downloaded again: ' + twice.slice(0, 3).join(', ');
  },
  async 'RL-3'(open) {
    const { page, s, errors } = await open();
    await s.visit(page);
    if (!(await workerAt(page, REAL))) return 'no worker after the first visit';
    await page.waitForLoadState('networkidle').catch(() => {});
    const asked = [];
    await page.addInitScript(() => {
      window.__bar = 0;
      new MutationObserver(() => { const f = document.querySelector('.boot-shell-fill'); if (f) window.__bar = Math.max(window.__bar, parseInt(f.style.width, 10) || 0); })
        .observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
    });
    for (let i = 0; i < 2; i++) {
      await expiry();
      const from = s.log.length;
      if (!(await s.visit(page))) return 'visit ' + (i + 2) + ' never reached the form';
      await page.waitForLoadState('load');
      await sleep(300);
      asked.push(s.log.slice(from));
    }
    const last = asked[1];
    const files = versioned(last).filter((r) => r.path !== BRAKE);
    if (files.length) return 'the return asked the server for ' + files.length + ' versioned files: ' + names(files);
    if (last.filter((r) => r.path === '/play.html' && r.dest === 'document').length !== 1) return 'the page\'s HTML did not come from the server exactly once: ' + last.filter((r) => r.path === '/play.html').length;
    if (last.filter((r) => r.path === BRAKE).length !== 1) return 'the brake was not asked of the server: it must never hang on the worker';
    const viaWorker = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.workerStart > 0 && /\.js\?v=/.test(e.name)).length);
    if (viaWorker < 200) return 'only ' + viaWorker + ' scripts came through the worker';
    const bar = await page.evaluate(() => window.__bar);
    if (!(bar > 0)) return 'the loading bar did not move with the worker answering: ' + bar;
    return !errors.length || 'console errors on a return: ' + errors[0];
  },
  async 'RL-4'(open) {
    for (const router of [true, false]) {
      /* the page's own CSP would refuse the other host before the worker saw the request: this rule is about the worker */
      const { page, s, other } = await open({ noCsp: true, workerPrefix: router ? '' : 'delete InstallEvent.prototype.addRoutes;\n', extra: { 'probe.js': '// a file the browser\'s own cache never answers for' } });
      await s.visit(page);
      if (!(await workerAt(page, REAL))) return 'no worker (router ' + router + ')';
      const count = () => s.log.filter((r) => r.path === '/probe.js').length;
      /* a pause between the two: time for a file kept by mistake to be there for the second one to find */
      const twice = ([u, i]) => page.evaluate(async ([url, init]) => { await (await fetch(url, init)).text(); await new Promise((k) => setTimeout(k, 400)); await (await fetch(url, init)).text(); }, [u, i]);
      /* the control: at this version it is asked for once, then kept, so the two-of-two below are the worker standing aside */
      const here = '/probe.js?v=' + REAL;
      await page.evaluate(async (url) => { await (await fetch(url)).text(); }, here);
      if (!(await until(page, (url) => caches.match(url).then((r) => !!r), here, 10000))) return 'the control (router ' + router + '): a versioned file was not kept';
      await page.evaluate(async (url) => { await (await fetch(url)).text(); }, here);
      if (count() !== 1) return 'the control (router ' + router + '): a versioned file was asked for ' + count() + ' times, not once';
      const leaves = [['no version', '/probe.js?n=1', {}], ['another version', '/probe.js?v=1.1.1', {}], ['a POST', here, { method: 'POST' }],
        ['a fresh copy', here, { cache: 'no-store' }], ['part of a file', here, { headers: { Range: 'bytes=0-9' } }]];
      for (const [what, url, init] of leaves) {
        const was = count();
        await twice([url, init]);
        if (count() - was !== 2) return what + ' (router ' + router + ') reached the server ' + (count() - was) + ' of 2 times';
      }
      /* another host, at this version */
      const url = other.base + '/x.js?v=' + REAL;
      await twice([url, {}]);
      if (other.seen.length !== 2) return 'another host (router ' + router + ') was asked ' + other.seen.length + ' of 2 times';
      /* a page's HTML, even at the version */
      const docs = () => s.log.filter((r) => r.path === '/play.html' && r.dest === 'document' && r.q === 'v=' + REAL).length;
      for (let i = 0; i < 2; i++) { await expiry(); await page.goto(s.base + '/play.html?v=' + REAL, { waitUntil: 'commit' }); await page.waitForSelector(FORM, { timeout: 30000 }).catch(() => {}); }
      if (docs() !== 2) return 'a page at a version query (router ' + router + ') reached the server ' + docs() + ' of 2 times';
      const st = await stateOf(page);
      const wrong = st.kept.filter((u) => /\.html|v=1\.1\.1|\?n=1|^http/.test(u));
      if (!st.kept.includes(here.slice(1))) return 'the control was not kept (router ' + router + ')';
      if (wrong.length) return 'kept what is not its business (router ' + router + '): ' + wrong.join(', ');
      await s.close(); await other.close();
    }
    return true;
  },
  async 'RL-5'(open) {
    const { page, s, errors } = await open();
    await s.visit(page);
    if (!(await workerAt(page, REAL))) return 'no worker before the flip';
    s.version = NEXT;
    s.deploy = DEPLOY_2;
    await expiry();
    const from = s.log.length;
    if (!(await s.visit(page))) return 'the new release never reached the form';
    if (!(await workerAt(page, NEXT))) return 'the new worker did not take over: ' + JSON.stringify((await stateOf(page)).regs);
    const flip = s.log.slice(from);
    const oldAsked = versioned(flip).filter((r) => r.q === 'v=' + REAL);
    if (oldAsked.length) return 'the new page asked for old files: ' + names(oldAsked);
    if (flip.filter((r) => r.path === '/play.html' && r.dest === 'document').length !== 1) return 'the flip reloaded the page';
    const tags = await page.evaluate(() => Array.from(document.querySelectorAll('script[src*="?v="], link[href*="?v="]')).map((t) => (t.src || t.href)));
    if (!tags.length || tags.some((t) => !t.endsWith('?v=' + NEXT))) return 'a tag of the page is not at the new version';
    const code = await page.evaluate((v) => fetch('/src/build-info.js?v=' + v).then((r) => r.text()), NEXT);
    if (!code.includes("'" + NEXT + "'")) return 'old bytes under the new version';
    const running = await page.evaluate((v) => import('/src/build-info.js?v=' + v).then((m) => m.BUILD.version), NEXT);
    if (running !== NEXT) return 'the page runs ' + running;
    const gone = await until(page, (want) => caches.keys().then((k) => k.join() === want), 'hearthrise-' + NEXT, 10000);
    if (!gone) return 'the old cache did not go: ' + (await stateOf(page)).keys.join();
    const st = await stateOf(page);
    const { missing } = await keptEveryFile(s, st, NEXT);
    if (missing.length) return 'the new cache lacks ' + missing.length + ' files: ' + missing.slice(0, 3).join(', ');
    if (st.purged) return 'the flip went through the brake';
    await expiry();
    const back = s.log.length;
    if (!(await s.visit(page))) return 'the return after the flip never reached the form';
    await page.waitForLoadState('load');
    await sleep(300);
    const files = versioned(s.log.slice(back)).filter((r) => r.path !== BRAKE);
    if (files.length) return 'the return after the flip asked for ' + files.length + ' files: ' + names(files);
    return !errors.length || 'console errors around the flip: ' + errors[0];
  },
  async 'RL-6'(open) {
    const { page, s, ctx } = await open();
    await s.visit(page);
    if (!(await workerAt(page, REAL))) return 'no worker before the reset';
    await expiry();
    const from = s.log.length;
    await page.goto(s.base + '/play.html?reset-sw=1', { waitUntil: 'commit' });
    const clean = await until(page, () => !/reset-sw/.test(location.search) && !!document.querySelector('form[data-auth="sign-in"]'));
    if (!clean) return 'the reset did not land on a clean page: ' + page.url();
    await sleep(600);
    let st = await stateOf(page);
    if (st.regs.length || st.keys.length) return 'the reset left: ' + JSON.stringify([st.regs, st.keys]);
    if (st.purged !== '1') return 'the once-only flag is not set';
    if (s.log.slice(from).filter((r) => r.path === '/play.html' && r.dest === 'document').length !== 2) return 'the reset did not reload exactly once';
    await expiry();
    await s.visit(page);
    await page.waitForLoadState('load');
    await sleep(600);
    st = await stateOf(page);
    if (st.regs.length || st.keys.length) return 'the wiped tab got a worker again: ' + JSON.stringify(st.regs);
    const tab = await ctx.newPage();
    await s.visit(tab);
    if (!(await workerAt(tab, REAL))) return 'a new tab did not register again';
    return true;
  },
  async 'RL-7'(open) {
    const cases = [
      ['a stranger\'s worker', (page) => page.evaluate(() => navigator.serviceWorker.register('/stranger.js', { scope: '/x/' }).then(() => true))],
      ['the old shape of ours, no version', (page) => page.evaluate(() => navigator.serviceWorker.register('/sw.js', { scope: '/y/' }).then(() => true))],
      ['the old client\'s cache', (page) => page.evaluate(() => caches.open('hearthbound-500').then(() => true))],
      ['a build-number cache', (page) => page.evaluate(() => caches.open('hearthrise-b500').then(() => true))],
    ];
    for (const [what, plant] of cases) {
      const { page, s } = await open({ extra: { 'stranger.js': '// a stranger', 'sw.js': '// the old one' }, on: false });
      await s.visit(page);
      /* planted through the page with the worker off, so the registration below is the only one */
      await plant(page);
      s.on = true;
      s.extra = { 'stranger.js': '// a stranger' };
      await expiry();
      await page.goto(s.base + '/play.html', { waitUntil: 'commit' });
      const wiped = await until(page, () => sessionStorage.getItem('hr-sw-purged') === '1' && !!document.querySelector('form[data-auth="sign-in"]'));
      if (!wiped) return what + ' was not wiped';
      await sleep(400);
      const st = await stateOf(page);
      if (st.regs.length || st.keys.length) return what + ' left: ' + JSON.stringify([st.regs, st.keys]);
      await s.close();
    }
    return true;
  },
  async 'RL-8'(open) {
    const { page, s } = await open();
    await s.visit(page);
    if (!(await workerAt(page, REAL))) return 'no worker before the brake';
    s.version = NEXT;
    s.deploy = DEPLOY_2;
    s.brakeOff = true;
    await expiry();
    await page.goto(s.base + '/play.html', { waitUntil: 'commit' });
    const wiped = await until(page, () => sessionStorage.getItem('hr-sw-purged') === '1' && !!document.querySelector('form[data-auth="sign-in"]'));
    if (!wiped) return 'the brake did not reach the player';
    await page.waitForLoadState('load');
    await sleep(600);
    const st = await stateOf(page);
    if (st.regs.length || st.keys.length) return 'after the brake: ' + JSON.stringify([st.regs, st.keys]);
    /* a player who never held it gets none either */
    const tab = await open({ brakeOff: true });
    await tab.s.visit(tab.page);
    await tab.page.waitForLoadState('load');
    await sleep(600);
    const fresh = await stateOf(tab.page);
    return !fresh.regs.length || 'the brake still lets a new player register';
  },
  async 'RL-9'(open) {
    const breaks = [
      ['storage that refuses', "self.addEventListener('activate', () => { setTimeout(() => { Cache.prototype.match = () => Promise.reject(new Error('planted')); }, 0); });\n"],
      ['storage that never answers', "self.addEventListener('activate', () => { setTimeout(() => { Cache.prototype.match = () => new Promise(() => {}); }, 0); });\n"],
    ];
    for (const [what, workerPrefix] of breaks) {
      const { page, s } = await open({ workerPrefix });
      await s.visit(page);
      if (!(await workerAt(page, REAL))) return what + ': no worker';
      await expiry();
      const from = s.log.length;
      if (!(await s.visit(page))) return what + ': no sign-in form, the page is blank';
      if (!versioned(s.log.slice(from)).filter((r) => r.path !== BRAKE).length) return what + ': nothing went to the network, so this measured nothing';
      await s.close();
    }
    const { page, s } = await open();
    await s.visit(page);
    if (!(await workerAt(page, REAL))) return 'no worker';
    /* an error status is never kept */
    const nope = 'nope.js?v=' + REAL;
    await page.evaluate(async (u) => { await fetch('/' + u); await fetch('/' + u); }, nope);
    if (s.log.filter((r) => r.path === '/nope.js').length !== 2) return 'a 404 was answered from the cache';
    if ((await stateOf(page)).kept.includes(nope)) return 'a 404 was kept';
    /* one 503 on a file of the first screen, not in the cache: the page's own retry brings it back, and the good copy is what is kept */
    const file = '/src/app/new-version.js';
    const key = file.slice(1) + '?v=' + REAL;
    await page.evaluate(async (u) => { for (const k of await caches.keys()) await (await caches.open(k)).delete('/' + u); }, key);
    s.failing.set(file, 1);
    await expiry();
    await page.goto(s.base + '/play.html', { waitUntil: 'commit' });
    const up = await until(page, () => !!document.querySelector('form[data-auth="sign-in"]'));
    if (!up) return 'one 503 under the worker stopped the page';
    const healed = await until(page, async (u) => { for (const k of await caches.keys()) { const r = await caches.open(k).then((c) => c.match('/' + u)); if (r && r.status === 200 && (await r.text()).includes('mountNewVersion')) return true; } return false; }, key, 10000);
    return !!healed || 'the good copy of a file that failed once was not kept';
  },
  async 'RL-10'(open) {
    const { page, s } = await open();
    await s.visit(page);
    if (!(await workerAt(page, REAL))) return 'no worker';
    const file = '/src/app/new-version.js';
    await page.evaluate(async (u) => { for (const k of await caches.keys()) await (await caches.open(k)).delete(u); }, file + '?v=' + REAL);
    s.failing.set(file, 99);
    await expiry();
    await page.goto(s.base + '/play.html', { waitUntil: 'commit' });
    const press = await until(page, () => !!document.querySelector('.boot-shell-again'), null, 40000);
    if (!press) return 'a file that always fails never reached the Reload press';
    s.failing.delete(file);
    await page.click('.boot-shell-again');
    const clean = await until(page, () => !/reset-sw/.test(location.search) && !!document.querySelector('form[data-auth="sign-in"]'));
    if (!clean) return 'the press did not bring the page back';
    await sleep(500);
    const st = await stateOf(page);
    return (!st.regs.length && !st.keys.length) || 'the press left: ' + JSON.stringify([st.regs, st.keys]);
  },
  async 'RL-11'(open) {
    const { page, s } = await open();
    await s.visit(page);
    if (!(await workerAt(page, REAL))) return 'no worker';
    const leaf = '/src/styles/market.css';
    const key = leaf.slice(1) + '?v=' + NEXT;
    s.version = NEXT;
    s.deploy = DEPLOY_2;
    s.oldBytes.add(leaf);
    await expiry();
    await s.visit(page);
    if (!(await workerAt(page, NEXT))) return 'no worker at the new version';
    let st = await stateOf(page);
    if (st.kept.includes(key)) return 'a file stamped by an older deploy was kept under the new version';
    if (st.kept.length < 300) return 'only ' + st.kept.length + ' files were kept: this measured nothing';
    s.oldBytes.delete(leaf);
    await expiry();
    await s.visit(page);
    const kept = await until(page, (u) => caches.keys().then(async (ks) => { for (const k of ks) { const r = await caches.open(k).then((c) => c.match('/' + u)); if (r) return true; } return false; }), key, 10000);
    return !!kept || 'the right bytes were not kept once they answered';
  },
  async 'RL-12'(open) {
    const { page, s } = await open();
    await s.visit(page);
    if (!(await workerAt(page, REAL))) return 'no worker';
    s.version = NEXT;
    s.deploy = DEPLOY_2;
    s.workerPageAt = REAL;
    s.pageNoStore = true;   // or the worker reads the page's own copy from the browser's cache
    await expiry();
    if (!(await s.visit(page))) return 'the page itself did not load';
    await page.waitForLoadState('load');
    await sleep(1200);
    let st = await stateOf(page);
    if (st.regs.some((u) => u.endsWith('?v=' + NEXT))) return 'a worker took over though its page names another version';
    if (!st.keys.includes('hearthrise-' + REAL)) return 'the old cache went before anything replaced it: ' + st.keys.join();
    s.workerPageAt = null;
    await expiry();
    await s.visit(page);
    if (!(await workerAt(page, NEXT))) return 'the next load did not register again';
    st = await stateOf(page);
    return st.kept.length >= 300 || 'the second go kept only ' + st.kept.length;
  },
  async 'RL-13'(open) {
    const { page, s } = await open();
    await s.visit(page);
    if (!(await workerAt(page, REAL))) return 'no worker';
    await page.goto(s.base + '/index.html', { waitUntil: 'load' });
    await sleep(500);
    const st = await stateOf(page);
    if (st.controlled) return 'the notice page is controlled by the worker';
    if (!st.regs.length || st.purged) return 'the notice page wiped the worker';
    await page.goto(s.base + '/play.html', { waitUntil: 'commit' });
    if (!(await page.waitForSelector(FORM, { timeout: 30000 }).then(() => true, () => false))) return 'back to the game: no form';
    return (await stateOf(page)).controlled || 'the game is not controlled';
  },
};

async function checks(overrides, only) {
  const fails = [];
  const browser = await leaseBrowser(chromium, { headless: true, args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
  for (const id of Object.keys(RULES)) {
    if (only && !only.includes(id)) continue;
    const opened = [];
    const open = async (o = {}) => {
      const s = Object.assign(await site(overrides), o);
      const other = { seen: [] };
      const os = createServer((req, res) => { other.seen.push(req.url); res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', 'Content-Type': 'text/javascript' }).end('// another host'); });
      await new Promise((k) => os.listen(0, '127.0.0.1', k));
      other.base = 'http://127.0.0.1:' + os.address().port;
      other.close = () => new Promise((k) => { os.close(k); os.closeAllConnections(); });
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await ctx.newPage();
      const errors = [];
      /* fonts and Sentry's hosts do not resolve here: that is the setup, not a page fault */
      page.on('console', (m) => { if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION|Failed to load resource/.test(m.text())) errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      s.visit = async (p) => {
        await p.goto(s.base + '/play.html', { waitUntil: 'commit', timeout: 60000 });
        return p.waitForSelector(FORM, { timeout: 45000 }).then(() => true, () => false);
      };
      opened.push({ s, other, ctx });
      return { page, s, other, ctx, errors };
    };
    try {
      const r = await RULES[id](open);
      if (r !== true) fails.push(id + ': ' + r);
    } catch (e) { fails.push(id + ': threw ' + String(e && e.message).split('\n')[0]); }
    for (const o of opened) { await o.ctx.close().catch(() => {}); await o.s.close().catch(() => {}); await o.other.close().catch(() => {}); }
    await browser.close();
  }
  return fails;
}

/* ── THE MUTANTS: the rule in the name is the one that must catch it (it alone runs, so a catch costs seconds). ── */
const MUTANTS = [
  ['any origin gets a worker (RL-1)', KILL_FILE, 'var allowed = WORKER_ON && location.origin === WORKER_ORIGIN;', 'var allowed = WORKER_ON;'],
  ['the install keeps nothing (RL-2)', WORKER_FILE, '    await fill();\n', ''],
  ['the page stays uncontrolled on a first visit (RL-2)', WORKER_FILE, '    await self.clients.claim();\n', ''],
  ['a fixed cache name (RL-2)', WORKER_FILE, "const CACHE = 'hearthrise-' + VERSION;", "const CACHE = 'hearthrise-1.0.0';"],
  ['the fill downloads every file again (RL-2)', WORKER_FILE, "await fetch(url, { cache: 'force-cache' })", "await fetch(url, { cache: 'reload' })"],
  ['the cache-first read is gone (RL-3)', WORKER_FILE, '    if (hit) return hit;\n', ''],
  ['the router sends versioned files to the network too (RL-3)', WORKER_FILE, '{ not: { urlPattern: new URLPattern(MAYBE_KEPT) } }', '{ urlPattern: new URLPattern(MAYBE_KEPT) }'],
  ['the worker holds the brake (RL-3)', WORKER_FILE, ' && url.pathname !== BRAKE', ''],
  ['the page brakes its own worker on every load (RL-3)', KILL_FILE, 'if (!regs.every(ours)) {', 'if (regs.length) {'],
  ['the bar does not count what the worker answers (RL-3)', 'src/platform/load-shell.js', 'if (/\\.js(\\?|$)/.test(entries[i].name)) landed++;', 'if (/\\.js(\\?|$)/.test(entries[i].name) && !entries[i].workerStart) landed++;'],
  ['a page at a version query is answered from the cache (RL-4)', WORKER_FILE, " || req.mode === 'navigate'", ''],
  ['every version is kept (RL-4)', WORKER_FILE, "url.searchParams.get('v') === VERSION", "url.searchParams.has('v')"],
  ['a request for a fresh copy is answered from the cache (RL-4)', WORKER_FILE, "  if (req.cache === 'no-store' || req.cache === 'reload' || req.cache === 'no-cache') return;\n", ''],
  ['part of a file is answered from the cache (RL-4)', WORKER_FILE, " || req.headers.has('range')", ''],
  ['another host is kept (RL-4)', WORKER_FILE, [["url.origin === self.location.origin && ", ''], [" || res.type !== 'basic'", '']]],
  ['the old cache stays (RL-5)', WORKER_FILE, "if (name !== CACHE && /^(hearthrise|hearthbound)-/.test(name)) await caches.delete(name);", ''],
  ['the new worker waits for every old tab (RL-5)', WORKER_FILE, '    await self.skipWaiting();\n', ''],
  ['every release goes through the brake (RL-5)', KILL_FILE, '!(allowed && OUR_CACHE.test(k))', 'k !== \'hearthrise-\' + BUILD'],
  ['the reset no longer wipes (RL-6)', KILL_FILE, "if (manual && !purged) { nuke('manual ?reset-sw=1'); return; }", ''],
  ['the wiped tab registers again (RL-6)', KILL_FILE, 'if (purged) { wipe().catch(function () {}); return; }', ''],
  ['a stranger\'s worker survives (RL-7)', KILL_FILE, 'return allowed && !!w && OUR_WORKER.test(w.scriptURL);', 'return true;'],
  ['a stranger\'s cache survives (RL-7)', KILL_FILE, 'if (stale) {', 'if (false) {'],
  ['the brake does nothing (RL-8)', KILL_FILE, 'var allowed = WORKER_ON && location.origin === WORKER_ORIGIN;', 'var allowed = location.origin === WORKER_ORIGIN;'],
  ['storage trouble blanks the page (RL-9)', WORKER_FILE, "catch (e) { /* storage trouble: the network's turn */ }", 'catch (e) { throw e; }'],
  ['a storage that never answers blanks the page (RL-9)', WORKER_FILE, 'return Promise.race([asked, late]).finally(() => clearTimeout(timer));', 'return asked;'],
  ['an error status is kept (RL-9)', WORKER_FILE, "if (res.status !== 200 || res.type !== 'basic' || res.redirected) return;", "if (res.type !== 'basic' || res.redirected) return;"],
  ['a file fetched past the cache is never kept (RL-9)', WORKER_FILE, 'if (missing) event.waitUntil(keep(cache, req, res.clone()).catch(() => {}));', ''],
  ['the press does not start clean (RL-10)', 'src/platform/load-shell.js', "if (worker) win.location.search = (win.location.search ? win.location.search + '&' : '?') + 'reset-sw=1'; else win.location.reload();", 'win.location.reload();'],
  ['old bytes are kept (RL-11)', WORKER_FILE, '  if (wrote < (await releaseStamp(cache)) - DEPLOY_SPREAD_MS) return;\n', ''],
  ['a worker takes over with a page at another version (RL-12)', WORKER_FILE, "  if (!urls.size) throw new Error('the page names no file at ' + VERSION);\n", ''],
  ['the worker controls the whole site (RL-13)', KILL_FILE, ", { scope: 'play.html' }", ''],
];

async function main() {
  const onlyAt = process.argv.indexOf('--only');   // rule ids or a mutant's name fragment: a local re-check
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null, onlyAt >= 0 ? process.argv[onlyAt + 1].split(',') : null);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'return-load: ' + fails.length + ' rule(s) RED' : 'return-load: every rule holds (' + Object.keys(RULES).length + ' rules)');
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await checks(null);
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  console.log('  ✓ clean control green');
  const chosen = MUTANTS.filter((m) => onlyAt < 0 || m[0].includes(process.argv[onlyAt + 1]));
  let bad = 0;
  for (const [name, file, from, to] of chosen) {
    let text = (await readFile(join(ROOT, file), 'utf8')).replace(/\r\n/g, '\n');
    const pairs = Array.isArray(from) ? from : [[from, to]];
    const missing = pairs.find(([a]) => !text.includes(a));
    if (missing) { console.log('  ✗ ' + name + ' — anchor not found in ' + file); bad++; continue; }
    for (const [a, b] of pairs) text = text.replace(a, b);
    const rule = /\((RL-\d+)\)/.exec(name)[1];
    const fails = await checks({ [file]: text }, [rule]);
    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(':')[0] + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  console.log(bad ? 'return-load --mutate: ' + bad + ' escaped' : 'return-load --mutate: ' + chosen.length + '/' + chosen.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}
main();
