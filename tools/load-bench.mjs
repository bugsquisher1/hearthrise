#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/load-bench.mjs — HOW LONG A PLAYER WAITS FOR THE FIRST PLAYABLE FRAME, AND ON WHAT. A manual measuring tool, not a CI guard.
//
//   node tools/load-bench.mjs local --site plain=DIR[,built=DIR] [--release plain=transform,built=DIR] [--runs 3] [--profiles desktop,phone] [--workers off,on] [--scenarios cold,return-expired,release] [--trace] [--js-profile] [--out FILE]
//   node tools/load-bench.mjs --table FILE...       reprint saved results
//   --settle MS  how long a walk stays after its first frame (default 2000): long enough, and a town's last sheet is timed too
//   --stand N   the hero takes the hearth's stand N, as a busier town would give it (the server's lowest free one: a quiet town gives 1). The local world only.
//
// Real Chrome (channel 'chrome', new headless), NEVER Playwright's headless shell: on Windows the shell queues a WinHTTP proxy lookup per request (p50 4.8 s),
// which was most of the "12 s return load". One browser at a time, a real on-disk profile per pass. Run nothing heavy beside it.
// The sign-in form alone, with no engine behind it, is the return-load lane's own bench; this one walks on: form -> characters -> Play -> town,
// over the real engine (tools/qa/local-world.mjs: PGlite, no production, no secrets; other hosts do not resolve, except Google Fonts).
//
// THE SERVER is a local GitHub Pages: h2 over TLS, gzip, etags, max-age, a 25 ms edge, about +40 ms when the CDN's copy has run out, and 28% of misses come
// back with another stamp on the etag, so the whole file (live 11-04: 112 of 393 answers). Telemetry loads as it does on live; its sends do not resolve.
//
// SCENARIOS, in one browser per site, worker and profile:
//   cold            a browser that has never been here: form -> characters -> Play -> town
//   return-expired  back after the max-age ran out (short here, so the bench is not ten minutes per sample)
//   release         back after a one-line release: --release names how it is made (plain: what bump-version.sh does to every URL; built: a folder from
//                   node tools/build-site.mjs --out DIR --as-version X.Y.Z --one-line src/shell/windows/settings.js). Bytes from the server's own log, which sees the worker's fetches too; TIMES with a worker in control are
//                   flattering on a throttled profile, because Chromium's page throttling does not reach a worker's own fetches.
// PROFILES: desktop 40 ms / 20 Mbps; phone 150 ms / 1.6 Mbps + 4x CPU; 4g 100 ms / 9 Mbps (the return-load lane's line) + 4x CPU when named 4gslow.
// --trace: one extra pass with Chrome's tracing on, reported apart (tracing slows a page): the main thread's own time by what it did, per phase.
// --js-profile: one extra cold pass with V8's sampling profiler on, reported apart: self time by function, per phase. Plain source names its functions; a built site names chunks.
//
// TEST CERTIFICATE: made at run time in the OS temp folder, never in the repo. Chrome is told its one key (an SPKI pin), because a browser that merely ignores a
// certificate error does not use its disk cache, and the cache is what this measures.
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
  '4g': { latency: 100, downKbps: 9000, upKbps: 1500, cpu: 1, viewport: { width: 1366, height: 768 }, touch: false },
  '4gslow': { latency: 100, downKbps: 9000, upKbps: 1500, cpu: 4, viewport: { width: 1366, height: 768 }, touch: false },
};
const EDGE_HIT_MS = 25, EDGE_MISS_MS = 40, ETAG_FLIP = 0.28;
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
const pairs = (s) => Object.fromEntries(String(s || '').split(',').filter(Boolean).map((p) => { const i = p.indexOf('='); return [p.slice(0, i), p.slice(i + 1)]; }));

// ── WHAT KIND OF FILE ────────────────────────────────────────────────────
function kindOf(url) {
  const u = new URL(url);
  const p = u.pathname;
  if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return 'fonts';
  if (/posthog|sentry/.test(u.hostname)) return 'telemetry-send';
  if (/^\/(auth|rest|functions|realtime)\/v1\//.test(p)) return 'api';
  if (/\/vendor\/|\/(posthog-js|sentry-|supabase-js)/.test(p)) return 'vendor';
  if (p.endsWith('.html') || p === '/') return 'html';
  if (p.endsWith('.css')) return 'css';
  if (p.endsWith('.json')) return /atlas-/.test(p) ? 'atlas-json' : 'json';
  if (/\.(png|webp|jpg|jpeg|svg|gif|ico)$/.test(p)) return /atlas-/.test(p) ? 'atlas' : 'image';
  if (p.endsWith('.js') || p.endsWith('.mjs')) return /glyphs/.test(p) ? 'glyphs' : 'module';
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
  const state = { site: null, maxAge: 600, log: [], worker: false };
  const cache = new Map();
  const edge = new Map();
  let origin = '';
  function served(site, rel) {
    const key = site.id + '|' + state.worker + '|' + rel;
    if (cache.has(key)) return cache.get(key);
    const f = normalize(join(site.root, rel));
    if (!f.startsWith(normalize(site.root)) || !existsSync(f) || !statSync(f).isFile()) return null;
    const ext = extname(f).toLowerCase();
    let raw = readFileSync(f);
    if (TEXT.has(ext) && !/vendor\/|\/(posthog-js|sentry-|supabase-js)/.test(rel)) {
      let t = raw.toString('utf8');
      if (site.transform) t = site.transform(rel, t);
      /* what local-world's rewriteServed does, for this origin, in any file: a built chunk names the project too. Telemetry loads as on live; its sends do not resolve. */
      t = t.replace(/https:\/\/[a-z0-9]+\.supabase\.co/g, origin).replace(/wss:\/\/[a-z0-9]+\.supabase\.co/g, origin.replace('https', 'wss'));
      t = t.replace(/publishableKey:\s*(['"])[^'"]+\1/g, "publishableKey:'local-world-publishable'");
      t = t.replace(/(['"]?)hearthrise\.net\1:\s*(['"])production\2/g, "'127.0.0.1':'production'");
      if (rel === 'src/platform/sw-killswitch.js') {
        t = state.worker ? t.replace("'https://hearthrise.net'", "'" + origin + "'") : t.replace('var WORKER_ON = true;', 'var WORKER_ON = false;');
      }
      raw = Buffer.from(t, 'utf8');
    }
    const row = { raw, gzip: TEXT.has(ext) ? gzipSync(raw, { level: 6 }) : null, etag: '"' + createHash('md5').update(raw).digest('hex').slice(0, 16) + '"', type: MIME[ext] || 'application/octet-stream', lastModified: new Date(site.deployed).toUTCString() };
    cache.set(key, row);
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
  const server = createSecureServer({ key: certificate.key, cert: certificate.cert, allowHTTP1: true, settings: { maxConcurrentStreams: 100 } }, async (req, res) => {
    const url = new URL(req.url, 'https://x');
    const p = decodeURIComponent(url.pathname);
    if (/^\/(auth|rest|functions)\/v1\//.test(p)) return proxy(req, res);
    const row = state.site && served(state.site, p === '/' ? 'play.html' : p.slice(1));
    /* the CDN: its copy of this URL runs out on the same clock as the browser's */
    const now = Date.now();
    const hit = (edge.get(req.url) || 0) > now;
    if (!hit) edge.set(req.url, now + state.maxAge * 1000);
    await sleep(EDGE_HIT_MS + (hit ? 0 : EDGE_MISS_MS * (0.6 + Math.random() * 0.8)));
    if (!row) { state.log.push({ url: req.url, status: 404, bytes: 0 }); res.writeHead(404); return res.end(); }
    const etag = !hit && Math.random() < ETAG_FLIP ? row.etag.replace('"', '"f') : row.etag;
    const common = { 'content-type': row.type, 'cache-control': 'max-age=' + state.maxAge, etag, 'last-modified': row.lastModified, vary: 'Accept-Encoding', 'access-control-allow-origin': '*' };
    if (req.headers['if-none-match'] === etag) { state.log.push({ url: req.url, status: 304, bytes: 0 }); res.writeHead(304, common); return res.end(); }
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
    ok({ origin, state, close: () => { server.closeAllConnections?.(); return new Promise((k) => server.close(k)); }, flush: () => { edge.clear(); cache.clear(); } });
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
  /* the frame a player sees: the first paint on the world's own canvas */
  const di = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (...r) { if (m.painted === undefined && this.canvas && this.canvas.classList && this.canvas.classList.contains('world-canvas')) m.painted = performance.now(); return di.apply(this, r); };
  addEventListener('click', () => { m.clicks.push(performance.now()); }, true);
})();`;

async function openPage(ctx, profile) {
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
    reqs.set(e.requestId, { url: e.request.url, method: e.request.method, kind: kindOf(e.request.url), type: e.type, start: e.timestamp, end: null, status: null, wireStatus: early.get(e.requestId) ?? null, bytes: 0, from: 'network' });
  });
  cdp.on('Network.requestServedFromCache', (e) => { const r = reqs.get(e.requestId); if (r) r.from = 'memory'; });
  /* a revalidation reads 200 in responseReceived (the cached answer); the wire's own status is here */
  cdp.on('Network.responseReceivedExtraInfo', (e) => { const r = reqs.get(e.requestId); if (r) r.wireStatus = e.statusCode; else early.set(e.requestId, e.statusCode); });
  cdp.on('Network.responseReceived', (e) => {
    const r = reqs.get(e.requestId); if (!r) return;
    r.status = e.response.status;
    if (e.response.fromServiceWorker) r.from = 'worker';
    else if (e.response.fromDiskCache) r.from = 'disk';
  });
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.end = e.timestamp; r.bytes = e.encodedDataLength; } });
  cdp.on('Network.loadingFailed', (e) => { const r = reqs.get(e.requestId); if (r) { r.end = e.timestamp; r.failed = e.errorText; } });
  await cdp.send('Network.enable');
  await cdp.send('Performance.enable');
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

function summarise(reqs, zero) {
  const kinds = {};
  const api = [];
  for (const r of reqs.values()) {
    const k = kinds[r.kind] || (kinds[r.kind] = { requests: 0, network: 0, revalidated: 0, cached: 0, bytes: 0, first: Infinity, last: 0 });
    k.requests++;
    if (r.from !== 'network') k.cached++;
    else if (r.wireStatus === 304 || r.status === 304) k.revalidated++;
    else k.network++;
    k.bytes += r.bytes || 0;
    k.first = Math.min(k.first, r.start);
    k.last = Math.max(k.last, r.end || r.start);
    if (r.kind === 'api') api.push({ url: new URL(r.url).pathname.replace(/^\/(rest|functions|auth)\/v1\//, ''), ms: r.end ? Math.round((r.end - r.start) * 1000) : null, bytes: r.bytes, at: Math.round((r.start - zero) * 1000) });
  }
  for (const k of Object.values(kinds)) { k.firstMs = Math.round((k.first - zero) * 1000); k.lastMs = Math.round((k.last - zero) * 1000); delete k.first; delete k.last; }
  return { kinds, api };
}

/** The whole walk. Answers the marks, in ms: form (from navigation), chars (from navigation or the submit), town (from the Play press), total (no typing). */
async function walk(opened, url, account, { settleMs = 2000 } = {}) {
  const { page, cdp, reqs, errors } = opened;
  const t0 = Date.now();
  const zero = () => { let s = Infinity; for (const r of reqs.values()) s = Math.min(s, r.start); return s; };
  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForSelector('form[data-auth="sign-in"], .char-row, .hs-launchers, [data-closed-notice]');
  const out = { form: await page.evaluate(() => window.__hb.signin ?? null) };
  out.metricsFirstScreen = await perfMetrics(cdp);
  if (await page.$('form[data-auth="sign-in"]')) {
    await page.fill('input[name=email]', account.email);
    await page.fill('input[name=password]', account.password);
    await page.click('.auth-submit');
  }
  await page.waitForSelector('.char-row, .hs-launchers, [data-closed-notice]');
  const hb1 = await page.evaluate(() => window.__hb);
  out.chars = hb1.submitted !== undefined ? hb1.chars - hb1.submitted : hb1.chars;
  out.charsFrom = hb1.submitted !== undefined ? 'submit' : 'navigation';
  if (await page.$('[data-app="play"]')) await page.click('[data-app="play"]');
  await page.waitForSelector('.hs-launchers');
  await page.waitForFunction(() => window.__hb.painted !== undefined);
  const hb2 = await page.evaluate(() => new Promise((k) => requestAnimationFrame(() => requestAnimationFrame(() => { window.__hb.frame = performance.now(); k(window.__hb); }))));
  const pressed = hb2.clicks.length ? hb2.clicks[hb2.clicks.length - 1] : null;
  out.town = pressed === null ? null : hb2.frame - pressed;
  out.metricsTown = await perfMetrics(cdp);
  out.total = (out.charsFrom === 'submit' ? (out.form || 0) : 0) + (out.chars || 0) + (out.town || 0);
  await sleep(settleMs);
  out.marks = await page.evaluate(() => window.__hb);
  const z = zero();
  out.settled = summarise(reqs, z);
  out.metricsSettled = await perfMetrics(cdp);
  out.sheetsAtFrame = [...reqs.values()].filter((r) => r.kind === 'atlas' && r.end && (r.end - z) * 1000 <= out.marks.painted).map((r) => new URL(r.url).pathname.split('/').pop().replace(/^atlas-|[-.].*$/g, ''));
  out.waterfall = [...reqs.values()].map((r) => [new URL(r.url).pathname.split('/').slice(-2).join('/'), r.kind, Math.round((r.start - z) * 1000), r.end ? Math.round((r.end - z) * 1000) : null, r.bytes, r.from, r.wireStatus ?? r.status]);
  out.errors = errors.filter((e) => !/ERR_NAME_NOT_RESOLVED|Failed to fetch|net::ERR_/.test(e)).slice(0, 8);
  out.wallMs = Date.now() - t0;
  return out;
}

// ── THE MAIN THREAD, BY WHAT IT DID ──────────────────────────────────────
/* Exclusive time of each event name on the renderer's main thread, per phase (ms from the page's start). A trace of `events`. */
function mainThreadBy(events, cuts) {
  const metaMain = events.find((e) => e.name === 'thread_name' && e.args && e.args.name === 'CrRendererMain');
  const nav = events.filter((e) => e.name === 'navigationStart' && e.args && e.args.data && /play\.html/.test(e.args.data.documentLoaderURL || '')).sort((a, b) => a.ts - b.ts)[0];
  if (!metaMain || !nav) return null;
  const main = (nav.pid ? events.filter((e) => e.pid === nav.pid && e.tid === nav.tid && e.ph === 'X' && e.dur) : []).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const phases = cuts.map((c) => ({ name: c.name, upTo: c.at, by: {} }));
  const phaseAt = (ms) => phases.find((p) => ms <= p.upTo) || phases[phases.length - 1];
  const stack = [];
  const flush = (e, until) => { if (until > e.cursor) { const at = (e.cursor - nav.ts) / 1000; const p = phaseAt(at); p.by[e.name] = (p.by[e.name] || 0) + (until - e.cursor) / 1000; } };
  for (const ev of main) {
    const e = { name: ev.name, end: ev.ts + ev.dur, cursor: ev.ts };
    while (stack.length && stack[stack.length - 1].end <= e.cursor) { const done = stack.pop(); flush(done, done.end); if (stack.length) stack[stack.length - 1].cursor = done.end; }
    if (stack.length) { const top = stack[stack.length - 1]; flush(top, e.cursor); top.cursor = e.cursor; }
    stack.push(e);
  }
  while (stack.length) { const done = stack.pop(); flush(done, done.end); if (stack.length) stack[stack.length - 1].cursor = done.end; }
  return phases.map((p) => ({ name: p.name, by: Object.fromEntries(Object.entries(p.by).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => [k, Math.round(v)])), total: Math.round(Object.values(p.by).reduce((a, b) => a + b, 0)) }));
}

async function traced(ctx, profile, url, account) {
  const opened = await openPage(ctx, profile);
  const events = [];
  opened.cdp.on('Tracing.dataCollected', (e) => events.push(...e.value));
  const finished = new Promise((k) => opened.cdp.once('Tracing.tracingComplete', k));
  await opened.cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: ['devtools.timeline', 'v8', 'v8.execute', 'blink.user_timing', 'loading', 'blink', 'disabled-by-default-v8.compile', 'disabled-by-default-devtools.timeline'] } });
  const r = await walk(opened, url, account, { settleMs: 500 });
  await opened.cdp.send('Tracing.end');
  await finished;
  const m = r.marks;
  const press = m.clicks.length ? m.clicks[m.clicks.length - 1] : null;
  const cuts = [{ name: 'to first screen', at: m.signin ?? m.chars }, { name: 'to characters', at: m.chars }, { name: 'to Play', at: press ?? m.chars }, { name: 'to first town frame', at: m.frame }, { name: 'after', at: Infinity }];
  const phases = mainThreadBy(events, cuts);
  await opened.page.close();
  return { marks: m, phases };
}

/* Self time by function and by file, per phase, from V8's sampling profiler (1 ms): the part of a trace's script time a name can be put on. */
function jsBy(profile, cuts, zeroUs) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const phases = cuts.map((c) => ({ name: c.name, upTo: c.at, fn: new Map(), file: new Map(), total: 0 }));
  let at = profile.startTime;
  for (let i = 0; i < profile.samples.length; i++) {
    at += profile.timeDeltas[i] || 0;
    const dt = (profile.timeDeltas[i + 1] ?? 0) / 1000;
    const ms = (at - zeroUs) / 1000;
    const p = phases.find((x) => ms <= x.upTo);
    if (!p) continue;
    const c = byId.get(profile.samples[i]).callFrame;
    if (c.functionName === '(idle)' || c.functionName === '(root)') continue;
    const file = (c.url || '').split('?')[0].split('/').slice(-2).join('/') || '(native)';
    const name = (c.functionName || '(anonymous)') + ' ' + file + (c.url ? ':' + c.lineNumber : '');
    p.fn.set(name, (p.fn.get(name) || 0) + dt);
    p.file.set(file, (p.file.get(file) || 0) + dt);
    p.total += dt;
  }
  const top = (m, n) => Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, Math.round(v)]));
  return phases.map((p) => ({ name: p.name, total: Math.round(p.total), fn: top(p.fn, 25), file: top(p.file, 12) }));
}

async function jsProfiled(ctx, profile, url, account) {
  const opened = await openPage(ctx, profile);
  await opened.cdp.send('Profiler.enable');
  await opened.cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  await opened.cdp.send('Profiler.start');
  const r = await walk(opened, url, account, { settleMs: 200 });
  const nowPage = await opened.page.evaluate(() => performance.now());
  const { profile: prof } = await opened.cdp.send('Profiler.stop');
  const m = r.marks;
  const press = m.clicks.length ? m.clicks[m.clicks.length - 1] : null;
  const cuts = [{ name: 'to first screen', at: m.signin ?? m.chars }, { name: 'to characters', at: m.chars }, { name: 'to Play', at: press ?? m.chars }, { name: 'to first town frame', at: m.frame }];
  /* the profile's clock is its own: its last sample is taken about now; line the two up through the page's clock */
  const phases = jsBy(prof, cuts, prof.endTime - nowPage * 1000);
  await opened.page.close();
  return { marks: m, phases };
}

// ── THE RELEASE: WHAT bump-version.sh MAKES OF A ONE-LINE CHANGE ─────────
function plainRelease(root, label) {
  const version = /cache:\s*'(\d+\.\d+\.\d+)'/.exec(readFileSync(join(root, 'src/build-info.js'), 'utf8'))[1];
  const parts = version.split('.');
  const next = [parts[0], parts[1], Number(parts[2]) + 1].join('.');
  return { id: label + '-B', root, label, deployed: Date.now() + 86400000,
    transform(rel, t) {
      let out = t.split('?v=' + version).join('?v=' + next);
      if (rel === 'src/build-info.js') out = out.split("'" + version + "'").join("'" + next + "'");
      if (rel === 'src/shell/launcher.js') out += '\n/* one line */\n';
      return out;
    } };
}

/* A fresh profile's first network request waits seconds on the browser's own start-up. A player's browser is already running: one request to a throwaway
   local page gets that out of the way, without warming any connection the page will use. */
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
  const ctx = await chromium.launchPersistentContext(dir, { channel: 'chrome', headless: true, viewport: profile.viewport, hasTouch: profile.touch, isMobile: profile.touch,
    args: ['--ignore-certificate-errors-spki-list=' + spki, '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE fonts.googleapis.com, EXCLUDE fonts.gstatic.com'] });
  await warmUp(ctx);
  return { ctx, close: async () => { await ctx.close().catch(() => {}); try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { /* the OS tidies its own temp */ } } };
}

const keep = (r) => ({ sheetsAtFrame: r.sheetsAtFrame, waterfall: r.waterfall, form: r.form, chars: r.chars, charsFrom: r.charsFrom, town: r.town, total: r.total, marks: r.marks, settled: r.settled, metricsFirstScreen: r.metricsFirstScreen, metricsTown: r.metricsTown, metricsSettled: r.metricsSettled, errors: r.errors, server: r.server, wallMs: r.wallMs });

function serverSum(log) {
  let bytes = 0, ok = 0, not = 0;
  for (const r of log) { bytes += r.bytes; if (r.status === 304) not++; else if (r.status === 200) ok++; }
  return { requests: log.length, ok, notModified: not, bytes };
}

async function waitWorker(page, version) {
  const t0 = Date.now();
  for (; Date.now() - t0 < 120000; await sleep(100)) {
    const ok = await page.evaluate(async (v) => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.active && r.active.state === 'activated' && !r.installing && !r.waiting && (!v || r.active.scriptURL.endsWith('v=' + v))); }, version).catch(() => false);
    if (ok) return Date.now() - t0;
  }
  return null;
}

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
  const roots = pairs(o.site || 'plain=' + ROOT);
  const releases = pairs(o.release || '');
  const sites = Object.entries(roots).map(([label, r]) => {
    const root = resolve(r);
    const base = { id: label + '-A', root, label, deployed: Date.now() };
    const how = releases[label] || 'transform';
    const release = how === 'transform' ? plainRelease(root, label) : { id: label + '-B', root: resolve(how), label, deployed: Date.now() + 86400000 };
    return { label, base, release };
  });
  const profiles = String(o.profiles || 'desktop,phone').split(',');
  const workers = String(o.workers || 'off').split(',');
  const runs = Number(o.runs || 3);
  const scenarios = new Set(String(o.scenarios || 'cold,return-expired,release').split(','));
  const jsProfiles = [];
  const results = [];
  const traces = [];
  const clearBudgets = () => world.db.query(`delete from public.hr_rate_counters`).catch(() => {});
  const SHORT_TTL = 2;
  for (let run = 0; run < runs; run++) {
    for (const profileName of profiles) {
      for (const worker of workers) {
        for (const site of sites) {
          const profile = PROFILES[profileName];
          const tag = site.label + (worker === 'on' ? '+worker' : '');
          const bank = async (scenario, r) => {
            results.push({ site: tag, profile: profileName, scenario, run, ...keep(r) });
            console.log(`[${run}] ${tag} ${profileName} ${scenario}: form ${Math.round(r.form ?? -1)} chars ${Math.round(r.chars ?? -1)} town ${Math.round(r.town ?? -1)} total ${Math.round(r.total ?? -1)} sheets-in ${(r.sheetsAtFrame || []).join('+')} last-sheet ${Math.round((r.settled.kinds.atlas || {}).lastMs ?? -1)} server ${Math.round(r.server.bytes / 1024)}K ${r.server.ok}/${r.server.notModified}${r.errors.length ? ' ERRORS ' + JSON.stringify(r.errors) : ''}`);
            await clearBudgets();
          };
          mimic.flush();
          mimic.state.site = site.base; mimic.state.maxAge = SHORT_TTL; mimic.state.worker = worker === 'on';
          if (o.stand) await world.db.query(`update public.town_bodies set stand_no = ${Number(o.stand)} where station_id is not null`);
          const b = await browser(profile, certificate.spki);
          try {
            let p = await openPage(b.ctx, profile);
            mimic.state.log = [];
            const cold = await walk(p, url, account, { settleMs: Number(o.settle || 2000) });
            cold.server = serverSum(mimic.state.log);
            await bank('cold', cold);
            if (worker === 'on') { const ms = await waitWorker(p.page); console.log('   worker active after ' + ms + ' ms'); }
            await p.page.close();
            if (scenarios.has('return-expired')) {
              await sleep((SHORT_TTL + 0.6) * 1000);
              p = await openPage(b.ctx, profile);
              mimic.state.log = [];
              const again = await walk(p, url, account);
              again.server = serverSum(mimic.state.log);
              await bank('return-expired', again);
              await p.page.close();
            }
            if (scenarios.has('release')) {
              mimic.state.site = site.release;
              await sleep((SHORT_TTL + 0.6) * 1000);
              p = await openPage(b.ctx, profile);
              mimic.state.log = [];
              const released = await walk(p, url, account);
              released.server = serverSum(mimic.state.log);
              await bank('release', released);
              await p.page.close();
            }
          } finally { await b.close(); }
          if (o.trace && run === 0) {
            mimic.flush();
            mimic.state.site = site.base;
            const t = await browser(profile, certificate.spki);
            try {
              const coldTrace = await traced(t.ctx, profile, url, account);
              traces.push({ site: tag, profile: profileName, scenario: 'cold', ...coldTrace });
              await clearBudgets();
              await sleep((SHORT_TTL + 0.6) * 1000);
              const backTrace = await traced(t.ctx, profile, url, account);
              traces.push({ site: tag, profile: profileName, scenario: 'return', ...backTrace });
              await clearBudgets();
            } finally { await t.close(); }
          }
          if (o['js-profile'] && run === 0) {
            mimic.flush();
            mimic.state.site = site.base;
            const t = await browser(profile, certificate.spki);
            try {
              jsProfiles.push({ site: tag, profile: profileName, scenario: 'cold', ...await jsProfiled(t.ctx, profile, url, account) });
              await clearBudgets();
            } finally { await t.close(); }
          }
        }
      }
    }
  }
  await mimic.close();
  await world.close();
  return { results, traces, jsProfiles };
}

// ── THE TABLE ────────────────────────────────────────────────────────────
function table(results) {
  const rows = new Map();
  for (const r of results) {
    const key = [r.site, r.profile, r.scenario].join(' | ');
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(r);
  }
  const out = [];
  out.push('site | profile | scenario | n | form ms | chars ms | town ms | total ms | wire KB (page) | server KB | server 200/304 | task ms | script ms');
  for (const [key, list] of [...rows.entries()].sort()) {
    const wire = list.map((r) => Object.values(r.settled.kinds).reduce((a, k) => a + k.bytes, 0));
    const met = (name) => Math.round(median(list.map((r) => (r.metricsTown || {})[name] * 1000)) || 0);
    const m = (f) => { const v = median(list.map(f)); return v === null ? '-' : Math.round(v); };
    out.push([key, list.length, m((r) => r.form), m((r) => r.chars), m((r) => r.town), m((r) => r.total), Math.round(median(wire) / 1024), m((r) => (r.server ? r.server.bytes / 1024 : null)),
      m((r) => r.server && r.server.ok) + '/' + m((r) => r.server && r.server.notModified), met('TaskDuration'), met('ScriptDuration')].join(' | '));
  }
  out.push('');
  out.push('BY KIND: requests network/304/cached, bytes, first-last ms');
  for (const [key, list] of [...rows.entries()].sort()) {
    const names = new Set(list.flatMap((r) => Object.keys(r.settled.kinds)));
    const parts = [...names].sort().map((k) => {
      const v = (f) => median(list.map((r) => (r.settled.kinds[k] ? f(r.settled.kinds[k]) : 0)));
      return k + ' ' + v((x) => x.network) + '/' + v((x) => x.revalidated) + '/' + v((x) => x.cached) + ' ' + Math.round(v((x) => x.bytes) / 1024) + 'K @' + v((x) => x.firstMs) + '-' + v((x) => x.lastMs);
    });
    out.push(key + ': ' + parts.join(' · '));
  }
  return out.join('\n');
}

function jsTable(list) {
  const out = [];
  for (const t of list || []) {
    out.push(`JS ${t.site} | ${t.profile} | ${t.scenario}`);
    for (const p of t.phases) {
      out.push('   ' + p.name + ' ' + p.total + ' ms; by file: ' + Object.entries(p.file).map(([k, v]) => k + ' ' + v).join(', '));
      out.push('      by function: ' + Object.entries(p.fn).map(([k, v]) => k + ' ' + v).join(', '));
    }
  }
  return out.join('\n');
}

function traceTable(traces) {
  const out = [];
  for (const t of traces) {
    out.push(`${t.site} | ${t.profile} | ${t.scenario}`);
    for (const p of t.phases || []) out.push('   ' + p.name + ' ' + p.total + ' ms: ' + Object.entries(p.by).map(([k, v]) => k + ' ' + v).join(', '));
  }
  return out.join('\n');
}

// ── MAIN ─────────────────────────────────────────────────────────────────
const o = args(process.argv.slice(2));
if (o.table) {
  const files = [o.table, ...o._].filter((f) => typeof f === 'string');
  const all = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
  console.log(table(all.flatMap((x) => x.results || x)));
  console.log(traceTable(all.flatMap((x) => x.traces || [])));
  console.log(jsTable(all.flatMap((x) => x.jsProfiles || [])));
  process.exit(0);
}
if (o._[0] !== 'local') { console.error('usage: node tools/load-bench.mjs local --site plain=DIR,built=DIR [--release built=DIR] [--runs N] [--profiles desktop,phone] [--workers off,on] [--trace] [--out FILE]'); process.exit(2); }
const { results, traces, jsProfiles } = await runLocal(o);
if (o.out) writeFileSync(o.out, JSON.stringify({ results, traces, jsProfiles }, null, 1));
console.log(table(results));
console.log(traceTable(traces));
console.log(jsTable(jsProfiles));
process.exit(0);
