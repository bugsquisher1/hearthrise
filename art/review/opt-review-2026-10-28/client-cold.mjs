// art/review/opt-review-2026-10-28/client-cold.mjs — a first-time visitor's cold load of the LIVE play.html, to the sign-in form.
//
//   node art/review/opt-review-2026-10-28/client-cold.mjs [url=https://hearthrise.net/play.html] [out.json]
//
// Headless Chromium (Playwright), a fresh context per run (empty HTTP cache), then a second navigation in the same
// context (the returning visitor, warm cache). Profiles: desktop 1440x900 unthrottled; phone 922x423 with 4x CPU
// throttling and a "fast 4G" link (CDP: 40 ms RTT, 9 Mbps down, 3 Mbps up). Records every response with its
// on-the-wire size (CDP Network.loadingFinished encodedDataLength), grouped by kind, plus DOMContentLoaded, load,
// the sign-in form visible, long tasks (> 50 ms) and their total during boot. Signs nobody in: read-only browsing.
import { writeFileSync } from 'node:fs';

const URL_ = process.argv[2] || 'https://hearthrise.net/play.html';
const out = process.argv[3];
const pw = await import('playwright');

const PROFILES = [
  { name: 'desktop-1440x900', width: 1440, height: 900, cpu: 1, net: null },
  { name: 'phone-922x423-cpu4x-fast4g', width: 922, height: 423, cpu: 4, net: { latency: 40, downloadThroughput: 9e6 / 8, uploadThroughput: 3e6 / 8 }, mobile: true },
];
const INIT = `(() => { window.__lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {} })();`;

async function visit(ctx, cdp, label) {
  const page = ctx.pages()[0] || await ctx.newPage();
  const reqs = new Map();
  const onResp = (e) => { reqs.set(e.requestId, Object.assign(reqs.get(e.requestId) || {}, { url: e.response.url, type: e.type, status: e.response.status, fromCache: e.response.fromDiskCache || e.response.fromServiceWorker || false, proto: e.response.protocol })); };
  const onDone = (e) => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength; };
  cdp.on('Network.responseReceived', onResp); cdp.on('Network.loadingFinished', onDone);
  const t0 = Date.now();
  await page.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  const loadMs = Date.now() - t0;
  await page.waitForSelector('form[data-auth="sign-in"]', { timeout: 120000 }).catch(() => null);
  const signInMs = Date.now() - t0;
  await page.waitForTimeout(3000);
  cdp.off('Network.responseReceived', onResp); cdp.off('Network.loadingFinished', onDone);
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0] || {}; return { ttfb: Math.round(n.responseStart || 0), dcl: Math.round(n.domContentLoadedEventEnd || 0), load: Math.round(n.loadEventEnd || 0) }; });
  const lt = await page.evaluate(() => window.__lt || []);
  const nodes = await page.evaluate(() => document.getElementsByTagName('*').length);
  const heap = (await cdp.send('Runtime.getHeapUsage')).usedSize;
  const kinds = {};
  for (const r of reqs.values()) {
    const ext = (r.url.split('?')[0].match(/\.([a-z0-9]+)$/i) || [, 'other'])[1].toLowerCase();
    const k = /supabase\.co/.test(r.url) ? 'supabase' : ['js', 'mjs'].includes(ext) ? 'js' : ['png', 'webp', 'jpg', 'gif', 'svg'].includes(ext) ? 'image' : ext === 'css' ? 'css' : ext === 'html' ? 'html' : ['woff', 'woff2', 'ttf'].includes(ext) ? 'font' : ext === 'json' ? 'json' : 'other';
    const g = kinds[k] || (kinds[k] = { n: 0, kb: 0, cached: 0 });
    g.n++; g.kb += (r.bytes || 0) / 1024; if (r.fromCache) g.cached++;
  }
  for (const g of Object.values(kinds)) g.kb = +g.kb.toFixed(1);
  const all = [...reqs.values()];
  const biggest = all.sort((a, b) => (b.bytes || 0) - (a.bytes || 0)).slice(0, 8).map((r) => ({ url: r.url.replace(/^https?:\/\/[^/]+\//, '').slice(0, 70), kb: +((r.bytes || 0) / 1024).toFixed(1) }));
  return { visit: label, requests: reqs.size, transferred_kb: +(all.reduce((a, r) => a + (r.bytes || 0), 0) / 1024).toFixed(1),
    protocols: [...new Set(all.map((r) => r.proto).filter(Boolean))], wall_load_ms: loadMs, wall_sign_in_form_ms: signInMs, nav,
    long_tasks: lt.length, long_task_ms: lt.reduce((a, x) => a + x[1], 0), worst_long_task_ms: Math.max(0, ...lt.map((x) => x[1])),
    dom_nodes: nodes, js_heap_mb: +(heap / 1048576).toFixed(1), by_kind: kinds, biggest };
}

const res = { url: URL_, at: new Date().toISOString(), runs: [] };
const browser = await pw.chromium.launch({ headless: true });
try {
  for (const p of PROFILES) {
    const ctx = await browser.newContext({ viewport: { width: p.width, height: p.height }, isMobile: !!p.mobile, hasTouch: !!p.mobile });
    await ctx.addInitScript(INIT);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    if (p.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpu });
    if (p.net) await cdp.send('Network.emulateNetworkConditions', Object.assign({ offline: false }, p.net));
    const cold = await visit(ctx, cdp, 'cold');
    const warm = await visit(ctx, cdp, 'warm');
    res.runs.push({ profile: p.name, cold, warm });
    console.log(p.name, JSON.stringify({ cold: { req: cold.requests, kb: cold.transferred_kb, signIn: cold.wall_sign_in_form_ms, nav: cold.nav, lt: cold.long_tasks, ltMs: cold.long_task_ms, worst: cold.worst_long_task_ms, kinds: cold.by_kind }, warm: { req: warm.requests, kb: warm.transferred_kb, signIn: warm.wall_sign_in_form_ms } }));
    await ctx.close();
  }
} finally { await browser.close(); }
if (out) writeFileSync(out, JSON.stringify(res, null, 1));
