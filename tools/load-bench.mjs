#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/load-bench.mjs — HOW LONG A PLAYER WAITS, BY WHAT, UNDER A FIXED NETWORK. A manual measuring tool, not a CI guard.
//
//   node tools/load-bench.mjs local [--site DIR] [--label NAME] [--runs 3] [--profiles desktop,phone] [--out FILE] [--release-site DIR]
//        Chromium over HTTP/2 + TLS against a local copy of GitHub Pages (max-age, etags, gzip), the real play.html on the
//        real engine (tools/qa/local-world.mjs: PGlite, no production, no secrets). --site DIR serves that folder (default: this
//        tree, as Pages does today, and a one-line release is what bump-version.sh makes of it); --release-site is the built folder of the same one-line change.
//        Scenarios per run, interleaved over the sites and profiles:
//          cold              a browser that has never been here: sign-in form -> characters -> Play -> town
//          return-fresh      the same browser, inside max-age
//          return-expired    the same browser, past max-age (the player who comes back after ten minutes)
//          release           the same browser after a one-line release: bytes this release cost
//   node tools/load-bench.mjs live [--runs 3] [--profiles desktop,phone] [--wait-expiry]
//        https://hearthrise.net to the sign-in form only; read-only, no account, the ingest hosts blocked. --wait-expiry waits the real ten minutes once.
//   node tools/load-bench.mjs --table FILE...   reprint saved results side by side
//
// WHAT THE NUMBERS ARE: a median over interleaved runs, Chromium's own network throttling (Network.emulateNetworkConditions:
// per-request latency, shared throughput), CPU throttling on the phone profile, a real disk cache (a persistent profile per run).
// Not modelled: TCP/TLS handshakes on the wire (localhost), a CDN's misses (see `live`). The bot presses at once, so the town's sheets
// are still arriving when Play is pressed: the worst case for that press, on purpose.
//
// TEST CERTIFICATE: made at run time in the OS temp folder, never in the repo. Chromium is told its one key (an SPKI pin), because a
// browser that merely ignores a certificate error does not use its disk cache, and the cache is what this measures.
// mutant-anchors: none — a manual measuring tool, not a CI guard; it asserts nothing
// ════════════════════════════════════════════════════════════════════════
import { createSecureServer } from 'node:http2';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { connect as netConnect } from 'node:net';
import { createHash, X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const PROFILES = {
  desktop: { latency: 40, downKbps: 20000, upKbps: 5000, cpu: 1, viewport: { width: 1280, height: 720 }, touch: false },
  phone: { latency: 150, downKbps: 1600, upKbps: 750, cpu: 4, viewport: { width: 844, height: 390 }, touch: true },
};
const PROD_HOST = 'nezapsylztqbbwuwembx.supabase.co';
const BLOCK = ['*.ingest.us.sentry.io/*', 'https://us.i.posthog.com/*', 'https://us-assets.i.posthog.com/*'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json' };
const TEXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.map']);
const sleep = (ms) => new Promise((k) => setTimeout(k, ms));
const median = (xs) => { const s = xs.filter((x) => x !== null && x !== undefined && !Number.isNaN(x)).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const next = argv[i + 1]; if (next === undefined || next.startsWith('--')) o[a.slice(2)] = true; else { o[a.slice(2)] = next; i++; } } else o._.push(a);
  }
  return o;
}

// ── WHAT KIND OF FILE ────────────────────────────────────────────────────
export function kindOf(url) {
  const u = new URL(url);
  const p = u.pathname;
  if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return 'fonts';
  if (/posthog|sentry/.test(u.hostname)) return 'telemetry-send';
  if (/^\/(auth|rest|functions|realtime)\/v1\//.test(p) || u.hostname.endsWith('.supabase.co')) return 'api';
  if (/\/vendor\/|vendor-/.test(p)) return 'vendor';
  if (p.endsWith('.html') || p === '/') return 'html';
  if (p.endsWith('.css')) return 'css';
  if (p.endsWith('.woff2')) return 'fonts';
  if (p.endsWith('.json')) return 'json';
  if (/\.(png|webp|jpg|jpeg|svg|gif|ico)$/.test(p)) return /\/world\/|atlas/.test(p) ? 'atlas' : 'image';
  if (p.endsWith('.js') || p.endsWith('.mjs')) return 'module';
  return 'other';
}

// ── THE TEST CERTIFICATE ─────────────────────────────────────────────────
function makeCertificate() {
  const dir = mkdtempSync(join(tmpdir(), 'hr-bench-cert-'));
  try {
    const key = join(dir, 'k.pem'), crt = join(dir, 'c.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '2', '-keyout', key, '-out', crt,
      '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
    const keyPem = readFileSync(key), certPem = readFileSync(crt);
    const spki = createHash('sha256').update(new X509Certificate(certPem).publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
    return { key: keyPem, cert: certPem, spki };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ── A LOCAL GITHUB PAGES ─────────────────────────────────────────────────
/* One server, one world behind it; the files it serves (`site`) and the max-age move between scenarios. */
function pagesMimic({ certificate, worldPort }) {
  const state = { site: null, maxAge: 600, log: [] };
  const gz = new Map();
  let origin = '';
  function served(site, rel) {
    const key = site.id + '|' + rel;
    if (gz.has(key)) return gz.get(key);
    const f = normalize(join(site.root, rel));
    if (!f.startsWith(normalize(site.root)) || !existsSync(f) || !statSync(f).isFile()) return null;
    const ext = extname(f).toLowerCase();
    let raw = readFileSync(f);
    if (TEXT.has(ext) && !/\/vendor\/|^assets\//.test(rel)) {
      let t = raw.toString('utf8');
      if (site.transform) t = site.transform(rel, t);
      /* what local-world's rewriteServed does, for this origin, in any file: a built chunk names the project too. Telemetry loads as it does on live; its sends are blocked. */
      t = t.replace(/https:\/\/[a-z0-9]+\.supabase\.co/g, origin).replace(/wss:\/\/[a-z0-9]+\.supabase\.co/g, origin.replace('https', 'wss'));
      t = t.replace(/publishableKey:\s*(['"])[^'"]+\1/g, "publishableKey:'local-world-publishable'");
      t = t.replace(/(['"]?)hearthrise\.net\1:\s*(['"])production\2/g, "'127.0.0.1':'production'");
      raw = Buffer.from(t, 'utf8');
    }
    const row = { raw, gzip: TEXT.has(ext) ? gzipSync(raw, { level: 6 }) : null, etag: '"' + createHash('md5').update(raw).digest('hex').slice(0, 16) + '"', type: MIME[ext] || 'application/octet-stream', lastModified: new Date(site.deployed || Date.now()).toUTCString() };
    gz.set(key, row);
    return row;
  }
  function proxy(req, res) {
    const headers = { ...req.headers, host: '127.0.0.1:' + worldPort };
    for (const h of Object.keys(headers)) if (h.startsWith(':')) delete headers[h];
    delete headers.connection;
    if (headers.origin) headers.origin = 'http://127.0.0.1:' + worldPort;
    const up = httpRequest({ host: '127.0.0.1', port: worldPort, method: req.method, path: req.url, headers }, (r) => {
      const out = { ...r.headers };
      for (const h of ['connection', 'keep-alive', 'transfer-encoding', 'upgrade']) delete out[h];
      res.writeHead(r.statusCode, out);
      r.pipe(res);
    });
    up.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(up);
  }
  const server = createSecureServer({ key: certificate.key, cert: certificate.cert, allowHTTP1: true }, (req, res) => {
    const url = new URL(req.url, 'https://x');
    const p = decodeURIComponent(url.pathname);
    if (/^\/(auth|rest|functions)\/v1\//.test(p)) return proxy(req, res);
    const row = state.site && served(state.site, p === '/' ? 'play.html' : p.slice(1));
    if (!row) { state.log.push({ url: req.url, status: 404, bytes: 0 }); res.writeHead(404); return res.end(); }
    const common = { 'content-type': row.type, 'cache-control': 'max-age=' + state.maxAge, etag: row.etag, 'last-modified': row.lastModified, vary: 'Accept-Encoding', 'access-control-allow-origin': '*' };
    if (req.headers['if-none-match'] === row.etag) { state.log.push({ url: req.url, status: 304, bytes: 0 }); res.writeHead(304, common); return res.end(); }
    const wantsGzip = row.gzip && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
    const body = wantsGzip ? row.gzip : row.raw;
    if (wantsGzip) common['content-encoding'] = 'gzip';
    common['content-length'] = String(body.length);
    state.log.push({ url: req.url, status: 200, bytes: body.length });
    res.writeHead(200, common);
    res.end(body);
  });
  server.on('upgrade', (req, socket, head) => {
    const up = netConnect(worldPort, '127.0.0.1', () => {
      up.write('GET ' + req.url + ' HTTP/1.1\r\n' + Object.entries({ ...req.headers, host: '127.0.0.1:' + worldPort }).map(([k, v]) => k + ': ' + v).join('\r\n') + '\r\n\r\n');
      if (head && head.length) up.write(head);
      up.pipe(socket); socket.pipe(up);
    });
    up.on('error', () => socket.destroy());
    socket.on('error', () => up.destroy());
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => {
    origin = 'https://127.0.0.1:' + server.address().port;
    ok({ origin, state, close: () => { server.closeAllConnections?.(); return new Promise((k) => server.close(k)); }, forget: () => gz.clear() });
  }));
}

// ── ONE PAGE, ONE WALK, EVERY REQUEST WRITTEN DOWN ───────────────────────
const MARKS = `(() => {
  const m = window.__hb = { clicks: [] };
  const want = { shell: '.boot-shell', signin: 'form[data-auth="sign-in"]', chars: '.char-row', hud: '.hs-launchers', canvas: 'canvas.world-canvas' };
  const check = () => { for (const k in want) if (m[k] === undefined && document.querySelector(want[k])) m[k] = performance.now(); };
  new MutationObserver(check).observe(document, { subtree: true, childList: true });
  addEventListener('DOMContentLoaded', () => { m.dcl = performance.now(); check(); });
  addEventListener('load', () => { m.load = performance.now(); });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) m[e.name] = e.startTime; }).observe({ type: 'paint', buffered: true }); } catch (e) {}
  addEventListener('submit', () => { m.submitted = performance.now(); }, true);
  addEventListener('click', () => { m.clicks.push(performance.now()); }, true);
})();`;

async function openPage(ctx, profile, block = BLOCK) {
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  page.setDefaultNavigationTimeout(180000);
  const cdp = await ctx.newCDPSession(page);
  const reqs = new Map();
  const early = new Map();
  cdp.on('Network.requestWillBeSent', (e) => {
    if (e.request.url.startsWith('data:') || e.request.url.startsWith('blob:')) return;
    const had = reqs.get(e.requestId);
    if (had && e.redirectResponse) return;
    reqs.set(e.requestId, { url: e.request.url, method: e.request.method, kind: kindOf(e.request.url), type: e.type, start: e.timestamp, end: null, status: null, wireStatus: early.get(e.requestId) ?? null, bytes: 0, from: 'network', protocol: null, ttfb: null });
  });
  cdp.on('Network.requestServedFromCache', (e) => { const r = reqs.get(e.requestId); if (r) r.from = 'memory'; });
  /* a revalidation reads 200 in responseReceived (the cached answer); the wire's own status is here */
  cdp.on('Network.responseReceivedExtraInfo', (e) => { const r = reqs.get(e.requestId); if (r) r.wireStatus = e.statusCode; else early.set(e.requestId, e.statusCode); });
  cdp.on('Network.responseReceived', (e) => {
    const r = reqs.get(e.requestId); if (!r) return;
    r.status = e.response.status; r.protocol = e.response.protocol;
    if (e.response.fromServiceWorker) r.from = 'worker';
    else if (e.response.fromDiskCache) r.from = 'disk';
    if (e.response.timing) { const g = e.response.timing; r.ttfb = g.receiveHeadersEnd; r.net = { dns: g.dnsEnd - g.dnsStart, connect: g.connectEnd - g.connectStart, ssl: g.sslEnd - g.sslStart, send: g.sendStart, headers: g.receiveHeadersEnd }; }
  });
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.end = e.timestamp; r.bytes = e.encodedDataLength; } });
  cdp.on('Network.loadingFailed', (e) => { const r = reqs.get(e.requestId); if (r) { r.end = e.timestamp; r.failed = e.errorText; } });
  await cdp.send('Network.enable');
  await cdp.send('Performance.enable');
  await cdp.send('Network.setBlockedURLs', { urls: block });
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.latency, downloadThroughput: profile.downKbps * 125, uploadThroughput: profile.upKbps * 125 });
  if (profile.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  await page.addInitScript(MARKS);
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return { page, cdp, reqs, errors };
}

async function perfMetrics(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const out = {};
  for (const m of metrics) if (['ScriptDuration', 'V8CompileDuration', 'TaskDuration', 'LayoutDuration', 'RecalcStyleDuration', 'JSHeapUsedSize'].includes(m.name)) out[m.name] = m.value;
  return out;
}

function summarise(reqs, navStartTs, upToTs = Infinity) {
  const kinds = {};
  let api = [];
  for (const r of reqs.values()) {
    if (r.start > upToTs) continue;
    const k = kinds[r.kind] || (kinds[r.kind] = { requests: 0, network: 0, revalidated: 0, cached: 0, bytes: 0, first: Infinity, last: 0 });
    k.requests++;
    if (r.from !== 'network') k.cached++;
    else if (r.wireStatus === 304 || r.status === 304) k.revalidated++;
    else k.network++;
    k.bytes += r.bytes || 0;
    k.first = Math.min(k.first, r.start);
    k.last = Math.max(k.last, r.end || r.start);
    if (r.kind === 'api') api.push({ url: new URL(r.url).pathname.replace(/^\/(rest|functions|auth)\/v1\//, ''), ms: r.end ? Math.round((r.end - r.start) * 1000) : null, bytes: r.bytes, at: Math.round((r.start - navStartTs) * 1000) });
  }
  for (const k of Object.values(kinds)) { k.windowMs = Math.round((k.last - k.first) * 1000); k.firstMs = Math.round((k.first - navStartTs) * 1000); k.lastMs = Math.round((k.last - navStartTs) * 1000); delete k.first; delete k.last; }
  return { kinds, api };
}

/** The whole walk. Answers the marks, in ms: form (from navigation), chars (from navigation or from the submit), town (from the Play press), total (no typing). */
async function walk(opened, url, account, { signInOnly = false, settleMs = 2500 } = {}) {
  const { page, cdp, reqs, errors } = opened;
  const t0 = Date.now();
  const navStart = () => { let s = Infinity; for (const r of reqs.values()) s = Math.min(s, r.start); return s; };
  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForSelector('form[data-auth="sign-in"], .char-row, .hs-launchers, [data-closed-notice]');
  const formAt = await page.evaluate(() => window.__hb.signin ?? null);
  const out = { form: formAt, html: [...reqs.values()].find((r) => r.kind === 'html')?.net || null };
  const mark = async () => summarise(reqs, navStart(), Infinity);
  out.atFirstScreen = await mark();
  out.metricsFirstScreen = await perfMetrics(cdp);
  if (signInOnly || account === null) {
    await sleep(settleMs);
    out.marks = await page.evaluate(() => window.__hb);
    out.settled = await mark();
    out.errors = errors.slice(0, 8);
    out.wallMs = Date.now() - t0;
    return out;
  }
  if (await page.$('form[data-auth="sign-in"]')) {
    await page.fill('input[name=email]', account.email);
    await page.fill('input[name=password]', account.password);
    await page.click('.auth-submit');
  }
  await page.waitForSelector('.char-row, .hs-launchers, [data-closed-notice]');
  const hb1 = await page.evaluate(() => window.__hb);
  out.chars = hb1.submitted !== undefined ? hb1.chars - hb1.submitted : hb1.chars;
  out.charsFrom = hb1.submitted !== undefined ? 'submit' : 'navigation';
  out.atChars = await mark();
  if (await page.$('[data-app="play"]')) {
    await page.click('[data-app="play"]');
  }
  await page.waitForSelector('.hs-launchers');
  const hb2 = await page.evaluate(() => new Promise((k) => requestAnimationFrame(() => requestAnimationFrame(() => { window.__hb.frame = performance.now(); k(window.__hb); }))));
  const pressed = hb2.clicks.length ? hb2.clicks[hb2.clicks.length - 1] : null;
  out.town = pressed === null ? null : hb2.frame - pressed;
  out.atTown = await mark();
  out.metricsTown = await perfMetrics(cdp);
  out.total = (out.charsFrom === 'submit' ? (out.form || 0) : 0) + (out.chars || 0) + (out.town || 0);
  await sleep(settleMs);
  out.marks = await page.evaluate(() => window.__hb);
  out.settled = await mark();
  out.metricsSettled = await perfMetrics(cdp);
  const zero = navStart();
  out.waterfall = [...reqs.values()].map((r) => [new URL(r.url).pathname.split('/').slice(-2).join('/'), r.kind, Math.round((r.start - zero) * 1000), r.end ? Math.round((r.end - zero) * 1000) : null, r.bytes, r.from, r.wireStatus ?? r.status]);
  out.errors = errors.filter((e) => !/ERR_BLOCKED_BY_CLIENT|net::ERR_FAILED/.test(e)).slice(0, 8);
  out.wallMs = Date.now() - t0;
  return out;
}

// ── THE RELEASE: WHAT bump-version.sh MAKES OF A ONE-LINE CHANGE ─────────
function sourceSite(root, label) {
  const build = readFileSync(join(root, 'src/build-info.js'), 'utf8');
  const version = /cache:\s*'(\d+\.\d+\.\d+)'/.exec(build)[1];
  const parts = version.split('.');
  const next = [parts[0], parts[1], Number(parts[2]) + 1].join('.');
  const base = { id: label + '-A', root, label, deployed: Date.now() };
  const release = { id: label + '-B', root, label, deployed: Date.now() + 86400000,
    transform(rel, t) {
      let out = t.split('?v=' + version).join('?v=' + next);
      if (rel === 'src/build-info.js') out = out.split("'" + version + "'").join("'" + next + "'");
      if (rel === 'src/shell/launcher.js') out += '\n/* one line */\n';
      return out;
    } };
  return { base, release };
}

/* A fresh profile's first network request waits seconds on the browser's own start-up (seen: 2.5 s before the page's HTML is even sent). A player's browser is
   already running: one request to a throwaway local page gets that out of the way, without warming any connection the page will use. */
async function warmUp(ctx) {
  const server = createHttpServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>warm</title>'); });
  await new Promise((k) => server.listen(0, '127.0.0.1', k));
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:' + server.address().port + '/');
  await page.close();
  server.closeAllConnections?.();
  await new Promise((k) => server.close(k));
}

async function browser(profile, spki) {
  const dir = mkdtempSync(join(tmpdir(), 'hr-bench-profile-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, viewport: profile.viewport, hasTouch: profile.touch, isMobile: profile.touch,
    args: ['--no-proxy-server', ...(spki ? ['--ignore-certificate-errors-spki-list=' + spki] : [])] });
  await warmUp(ctx);
  return { ctx, close: async () => { await ctx.close().catch(() => {}); try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { /* the OS tidies its own temp */ } } };
}

const keep = (r) => ({ waterfall: r.waterfall, html: r.html, form: r.form, chars: r.chars, charsFrom: r.charsFrom, town: r.town, total: r.total, marks: r.marks, atFirstScreen: r.atFirstScreen, atChars: r.atChars, atTown: r.atTown, settled: r.settled, metricsFirstScreen: r.metricsFirstScreen, metricsTown: r.metricsTown, metricsSettled: r.metricsSettled, errors: r.errors, server: r.server, wallMs: r.wallMs });

// ── LOCAL ────────────────────────────────────────────────────────────────
async function runLocal(o) {
  const certificate = makeCertificate();
  const { openWorld, LOCAL_PASSWORD } = await import('./qa/local-world.mjs');
  console.log('opening the local world (a first run on a machine replays the chain)...');
  const world = await openWorld({ tickMs: false });
  const seed = await world.play({ account: 'bench' });
  await seed.createHero('Bencher');
  await seed.close();
  const account = { email: 'bench@local-world.test', password: LOCAL_PASSWORD };
  const worldPort = Number(new URL(world.origin).port);
  const mimic = await pagesMimic({ certificate, worldPort });
  const url = mimic.origin + '/play.html';
  const sites = [];
  const labels = String(o.label || 'source').split(',');
  const roots = String(o.site || ROOT).split(',');
  const releaseRoots = o['release-site'] ? String(o['release-site']).split(',') : [];
  roots.forEach((r, i) => {
    const label = labels[i] || r;
    const root = resolve(r);
    if (releaseRoots[i] && releaseRoots[i] !== '-') sites.push({ label, base: { id: label + '-A', root, label, deployed: Date.now() }, release: { id: label + '-B', root: resolve(releaseRoots[i]), label, deployed: Date.now() + 86400000 } });
    else { const s = sourceSite(root, label); sites.push({ label, base: s.base, release: s.release }); }
  });
  const profiles = String(o.profiles || 'desktop,phone').split(',');
  const runs = Number(o.runs || 3);
  const results = [];
  const clearBudgets = () => world.db.query(`delete from public.hr_rate_counters`).catch(() => {});
  for (let run = 0; run < runs; run++) {
    for (const profileName of profiles) {
      for (const site of sites) {
        const profile = PROFILES[profileName];
        const bank = async (scenario, r) => {
          results.push({ site: site.label, profile: profileName, scenario, run, ...keep(r) });
          const kinds = Object.entries(r.settled.kinds).map(([k, v]) => k + ' ' + v.network + '/' + v.revalidated + '/' + v.cached + ' ' + Math.round(v.bytes / 1024) + 'K').join(' · ');
          console.log(`[${run}] ${site.label} ${profileName} ${scenario}: form ${Math.round(r.form ?? -1)} chars ${Math.round(r.chars ?? -1)} town ${Math.round(r.town ?? -1)} total ${Math.round(r.total ?? -1)}${r.errors.length ? ' ERRORS ' + r.errors.length : ''}\n      ${kinds}`);
          await clearBudgets();
        };
        /* two passes: inside max-age, then past it (a separate cold browser, with a max-age short enough to expire) */
        for (const maxAge of [600, 2]) {
          mimic.state.site = site.base; mimic.state.maxAge = maxAge;
          const b = await browser(profile, certificate.spki);
          try {
            let p = await openPage(b.ctx, profile);
            mimic.state.log = [];
            const cold = await walk(p, url, account);
            cold.server = serverSum(mimic.state.log);
            await bank(maxAge === 600 ? 'cold' : 'cold2', cold);
            await p.page.close();
            await sleep(maxAge === 2 ? 2600 : 300);
            p = await openPage(b.ctx, profile);
            mimic.state.log = [];
            const again = await walk(p, url, account);
            again.server = serverSum(mimic.state.log);
            await bank(maxAge === 600 ? 'return-fresh' : 'return-expired', again);
            await p.page.close();
            if (maxAge === 2) {   // a release reaches a player through the page's HTML, past its max-age
              mimic.state.site = site.release;
              await sleep(2600);
              p = await openPage(b.ctx, profile);
              mimic.state.log = [];
              const released = await walk(p, url, account);
              released.server = serverSum(mimic.state.log);
              await bank('release', released);
              await p.page.close();
            }
          } finally { await b.close(); }
        }
      }
    }
  }
  await mimic.close();
  await world.close();
  return results;
}

function serverSum(log) {
  let bytes = 0, ok = 0, not = 0;
  for (const r of log) { bytes += r.bytes; if (r.status === 304) not++; else if (r.status === 200) ok++; }
  return { requests: log.length, ok, notModified: not, bytes };
}

// ── LIVE ─────────────────────────────────────────────────────────────────
async function runLive(o) {
  const profiles = String(o.profiles || 'desktop,phone').split(',');
  const runs = Number(o.runs || 3);
  const url = 'https://hearthrise.net/play.html';
  const results = [];
  for (let run = 0; run < runs; run++) {
    for (const profileName of profiles) {
      const profile = PROFILES[profileName];
      const b = await browser(profile, null);
      try {
        let p = await openPage(b.ctx, profile);
        const cold = await walk(p, url, null);
        results.push({ site: 'live', profile: profileName, scenario: 'cold', run, ...keep(cold) });
        console.log(`[${run}] live ${profileName} cold: form ${Math.round(cold.form)} wall ${cold.wallMs}`);
        await p.page.close();
        p = await openPage(b.ctx, profile);
        const fresh = await walk(p, url, null);
        results.push({ site: 'live', profile: profileName, scenario: 'return-fresh', run, ...keep(fresh) });
        console.log(`[${run}] live ${profileName} return-fresh: form ${Math.round(fresh.form)}`);
        await p.page.close();
        if (o['wait-expiry'] && run === 0) {
          console.log('waiting the real ten minutes...');
          await sleep(605000);
          p = await openPage(b.ctx, profile);
          const expired = await walk(p, url, null);
          results.push({ site: 'live', profile: profileName, scenario: 'return-expired', run, ...keep(expired) });
          console.log(`[${run}] live ${profileName} return-expired: form ${Math.round(expired.form)}`);
          await p.page.close();
        }
      } finally { await b.close(); }
    }
  }
  return results;
}

// ── THE TABLE ────────────────────────────────────────────────────────────
function table(results) {
  const rows = new Map();
  for (const r of results) {
    const scenario = r.scenario === 'cold2' ? 'cold' : r.scenario;
    const key = [r.site, r.profile, scenario].join(' | ');
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(r);
  }
  const out = [];
  out.push('site | profile | scenario | n | form ms | chars ms | town ms | total ms | wire KB | server KB | requests net/304/cached | script ms');
  for (const [key, list] of rows) {
    const reqs = list.map((r) => Object.values(r.settled.kinds).reduce((a, k) => [a[0] + k.network, a[1] + k.revalidated, a[2] + k.cached], [0, 0, 0]));
    const wire = list.map((r) => Object.values(r.settled.kinds).reduce((a, k) => a + k.bytes, 0));
    const script = list.map((r) => Math.round(((r.metricsSettled || r.metricsFirstScreen || {}).ScriptDuration || 0) * 1000));
    const m = (f) => { const v = median(list.map(f)); return v === null ? '-' : Math.round(v); };
    out.push([key, list.length, m((r) => r.form), m((r) => r.chars), m((r) => r.town), m((r) => r.total),
      Math.round(median(wire) / 1024), m((r) => (r.server ? r.server.bytes / 1024 : null)),
      [0, 1, 2].map((i) => median(reqs.map((x) => x[i]))).join('/'), median(script)].join(' | '));
  }
  out.push('');
  out.push('BY KIND (median of the first listed scenario per site+profile):');
  for (const [key, list] of rows) {
    const names = new Set(list.flatMap((r) => Object.keys(r.settled.kinds)));
    const parts = [...names].sort().map((k) => {
      const v = (f) => median(list.map((r) => (r.settled.kinds[k] ? f(r.settled.kinds[k]) : 0)));
      return k + ' ' + v((x) => x.network) + '/' + v((x) => x.revalidated) + '/' + v((x) => x.cached) + ' ' + Math.round(v((x) => x.bytes) / 1024) + 'K @' + v((x) => x.firstMs) + '-' + v((x) => x.lastMs);
    });
    out.push(key + ': ' + parts.join(' · '));
  }
  return out.join('\n');
}

// ── MAIN ─────────────────────────────────────────────────────────────────
const o = args(process.argv.slice(2));
if (o.table) {
  const files = [o.table, ...o._].filter((f) => typeof f === 'string');
  console.log(table(files.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')))));
  process.exit(0);
}
const mode = o._[0];
if (mode !== 'local' && mode !== 'live') { console.error('usage: node tools/load-bench.mjs local|live [--runs N] [--profiles desktop,phone] [--out FILE]'); process.exit(2); }
const results = mode === 'live' ? await runLive(o) : await runLocal(o);
if (o.out) writeFileSync(o.out, JSON.stringify(results, null, 1));
console.log(table(results));
process.exit(0);
