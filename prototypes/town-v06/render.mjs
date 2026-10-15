// node prototypes/town-v06/render.mjs — live town vs v0.6 market, real engine at x2, side by side.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.html': 'text/html' };
const srv = createServer((q, r) => { const p = join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!existsSync(p)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); r.end(readFileSync(p)); }).listen(0);
const port = srv.address().port;
const b = await chromium.launch();
const W = 1536, H = 896;
const shots = [['live', '/src/data/world/maps/town_common.js', 12, 7], ['v06', '/prototypes/town-v06/the_common_market.art.js', 32, 22], ['v06-gate', '/prototypes/town-v06/the_common_market.art.js', 30, 9]];
const page = await b.newPage({ viewport: { width: W * 3 + 32, height: H + 40 } });
const bufs = [];
for (const [name, map, x, y] of shots) {
  const p = await b.newPage({ viewport: { width: W, height: H } });
  p.on('console', (m) => m.type() === 'error' && console.log(name, m.text()));
  await p.goto(`http://localhost:${port}/prototypes/town-v06/render.html?map=${map}&x=${x}&y=${y}`);
  await p.waitForFunction(() => window.__done, null, { timeout: 15000 });
  bufs.push([name, (await p.screenshot()).toString('base64')]);
  await p.screenshot({ path: join(ROOT, 'prototypes/town-v06/engine-' + name + '.png') });
}
await page.setContent('<body style="margin:0;background:#111;color:#fff;font:16px sans-serif;display:flex;gap:16px">' + bufs.map(([n, d]) => `<div><div style="height:40px;line-height:40px">${n === 'live' ? 'LIVE town_common (atlas on main)' : 'v0.6 the_common_market — ' + (n === 'v06' ? 'plaza' : 'gatehouse / High Row')} — real engine x2</div><img src="data:image/png;base64,${d}"></div>`).join('') + '</body>');
await page.screenshot({ path: join(ROOT, 'prototypes/town-v06/side-by-side.png') });
await b.close(); srv.close(); console.log('ok');
