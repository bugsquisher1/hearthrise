// TEMPORARY, proof branch only: the runner's stock Firefox (geckodriver, no Playwright): does a navigation land under the worker? Removed with tmp-browsers-proof.yml.
import { spawn } from 'node:child_process';
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
  log.push(req.url);
  const f = normalize(join(root, rel));
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404).end(); return; }
  let body = readFileSync(f);
  if (rel === 'src/platform/sw-killswitch.js') body = Buffer.from(body.toString().replace("'https://hearthrise.net'", "'" + origin + "'"));
  if (rel === 'play.html') body = Buffer.from(body.toString().replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, ''));
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Last-Modified': 'Sun, 01 Nov 2026 12:00:00 GMT' }).end(body);
});
await new Promise((k) => server.listen(0, 'localhost', k));
origin = 'http://localhost:' + server.address().port;

const PORT = 4455;
const driver = spawn('geckodriver', ['--port', String(PORT)], { stdio: 'ignore' });
driver.on('error', (e) => { console.log('no geckodriver', e.message); process.exit(0); });
await new Promise((k) => setTimeout(k, 1500));
const call = async (path, body) => {
  const res = await fetch('http://127.0.0.1:' + PORT + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await res.json();
  if (j.value && j.value.error) throw new Error(j.value.error + ': ' + j.value.message);
  return j.value;
};
const made = await call('/session', { capabilities: { alwaysMatch: { browserName: 'firefox', 'moz:firefoxOptions': { args: ['-headless'] } } } });
console.log('stock browser', JSON.stringify({ name: made.capabilities.browserName, version: made.capabilities.browserVersion }));
const sid = made.sessionId;
const run = (script) => call('/session/' + sid + '/execute/sync', { script, args: [] });
const runAsync = (script) => call('/session/' + sid + '/execute/async', { script, args: [] });
const sleep = (ms) => new Promise((k) => setTimeout(k, ms));
const STATE = `const done = arguments[arguments.length - 1]; (async () => { const regs = await navigator.serviceWorker.getRegistrations(); done(JSON.stringify({ url: location.href, secure: isSecureContext, controller: navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL, regs: regs.map((r) => [r.scope, r.active && r.active.state]), caches: await caches.keys(), resources: performance.getEntriesByType('resource').reduce((a, e) => { a.n++; if (e.workerStart > 0) a.viaWorker++; return a; }, { n: 0, viaWorker: 0 }) })); })().catch((e) => done('error ' + e.message));`;
async function visit(label) {
  log.length = 0;
  await call('/session/' + sid + '/url', { url: origin + '/play.html' });
  for (let i = 0; i < 200; i++) { if (await run("return !!document.querySelector('form[data-auth=\"sign-in\"]')")) break; await sleep(150); }
  await sleep(800);
  console.log(label, await runAsync(STATE), 'asked /a/:', log.filter((l) => l.startsWith('/a/')).length, 'of', log.length, 'first:', log.slice(0, 2).join(' | '));
}
await visit('first');
for (let i = 0; i < 200; i++) { if (await run('return !!navigator.serviceWorker.controller')) break; await sleep(150); }
console.log('after wait', await runAsync(STATE));
await visit('second');
await visit('third');
await call('/session/' + sid, undefined).catch(() => {});
await fetch('http://127.0.0.1:' + PORT + '/session/' + sid, { method: 'DELETE' }).catch(() => {});
driver.kill();
server.closeAllConnections();
server.close();
process.exit(0);
