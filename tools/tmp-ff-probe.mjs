// TEMPORARY, proof branch only: why Playwright's Firefox reads "not controlled" on a second load. Removed with tmp-browsers-proof.yml.
import { firefox } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { buildSite } from './build-site.mjs';

const built = await buildSite({ out: 'dist' });
const root = built.out;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };
const log = [];
let origin = '';
const server = createServer((req, res) => {
  const [p] = (req.url || '/').split('?');
  const rel = decodeURIComponent(p).slice(1);
  log.push(req.url + ' mode=' + req.headers['sec-fetch-mode'] + ' dest=' + req.headers['sec-fetch-dest'] + ' sw=' + (req.headers['service-worker'] || ''));
  const f = normalize(join(root, rel));
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404).end(); return; }
  let body = readFileSync(f);
  if (rel === 'src/platform/sw-killswitch.js') body = Buffer.from(body.toString().replace("'https://hearthrise.net'", "'" + origin + "'"));
  if (rel === 'play.html') body = Buffer.from(body.toString().replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, ''));
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Last-Modified': 'Sun, 01 Nov 2026 12:00:00 GMT' }).end(body);
});
await new Promise((k) => server.listen(0, 'localhost', k));
origin = 'http://localhost:' + server.address().port;

const state = (page) => page.evaluate(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  return { url: location.href, controller: navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL, regs: regs.map((r) => [r.scope, r.active && r.active.state, r.active && r.active.scriptURL]), caches: await caches.keys(), purged: sessionStorage.getItem('hr-sw-purged'),
    timing: performance.getEntriesByType('resource').slice(0, 400).reduce((a, e) => { a.n++; if (e.workerStart > 0) a.viaWorker++; return a; }, { n: 0, viaWorker: 0 }) };
});
async function visit(page, label, how) {
  log.length = 0;
  await how();
  await page.waitForSelector('form[data-auth="sign-in"]', { timeout: 60000 }).catch((e) => console.log('no form', e.message.slice(0, 100)));
  await new Promise((k) => setTimeout(k, 800));
  const asked = log.filter((l) => l.startsWith('/a/'));
  console.log(label, JSON.stringify(await state(page)), 'asked /a/:', asked.length, 'of', log.length, 'first:', log.slice(0, 2).join(' | '));
}

for (const variant of ['default', 'allow']) {
  const browser = await firefox.launch({ headless: true });
  const ctx = await browser.newContext(variant === 'allow' ? { serviceWorkers: 'allow' } : {});
  const page = await ctx.newPage();
  page.on('console', (m) => { if (/killswitch|worker/i.test(m.text())) console.log('  console', m.type(), m.text().slice(0, 200)); });
  page.on('pageerror', (e) => console.log('  pageerror', e.message.slice(0, 200)));
  console.log('--- ' + variant, await page.evaluate(() => navigator.userAgent).catch(() => ''));
  await visit(page, 'first', () => page.goto(origin + '/play.html', { waitUntil: 'load' }));
  for (let i = 0; i < 200; i++) { const s = await state(page); if (s.controller) break; await new Promise((k) => setTimeout(k, 150)); }
  console.log('after wait', JSON.stringify(await state(page)));
  await visit(page, 'A page.goto', () => page.goto(origin + '/play.html', { waitUntil: 'load' }));
  await visit(page, 'A2 page.goto again', () => page.goto(origin + '/play.html', { waitUntil: 'load' }));
  await visit(page, 'B location.href', () => Promise.all([page.waitForNavigation({ timeout: 60000 }).catch(() => {}), page.evaluate(() => { location.href = '/play.html'; })]));
  await visit(page, 'C anchor click', () => Promise.all([page.waitForNavigation({ timeout: 60000 }).catch(() => {}), page.evaluate(() => { const a = document.createElement('a'); a.href = '/play.html'; document.body.append(a); a.click(); })]));
  await visit(page, 'D reload', () => page.reload({ waitUntil: 'load' }));
  const other = await ctx.newPage();
  await visit(other, 'E new tab goto', () => other.goto(origin + '/play.html', { waitUntil: 'load' }));
  const third = await ctx.newPage();
  await third.goto(origin + '/src/build-info.js');
  await visit(third, 'F from another page, location.href', () => Promise.all([third.waitForNavigation({ timeout: 60000 }).catch(() => {}), third.evaluate(() => { location.href = '/play.html'; })]));
  /* the same kept file asked by a page that the worker controls? */
  console.log('fetch in a controlled page?', JSON.stringify(await page.evaluate(async () => { const before = performance.getEntriesByType('resource').length; await fetch(document.querySelector('link[rel=stylesheet]').href); await new Promise((k) => setTimeout(k, 200)); const e = performance.getEntriesByType('resource').slice(before); return { controller: !!navigator.serviceWorker.controller, entries: e.map((x) => [x.name.split('/').pop(), x.workerStart]) }; })));
  await browser.close();
}
server.closeAllConnections();
server.close();
process.exit(0);
