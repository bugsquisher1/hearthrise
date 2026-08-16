/**
 * Is the arena portrait being DIMMED, or is it just sitting on a dark plate?
 * The clip captures read darker than the source PNGs, and computed style on the
 * <img> shows no filter and opacity 1 — so if something is dimming it, it is an
 * element ON TOP. This asks the page what is actually at the portrait's centre
 * and measures the rendered pixels against the source file's own pixels.
 *   node tools/art-arena-dim-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
function findPlaywright(from) { let d = from; for (let i = 0; i < 8; i++) { const p = join(d, 'node_modules', 'playwright', 'index.mjs'); if (existsSync(p)) return pathToFileURL(p).href; const up = normalize(join(d, '..')); if (up === d) break; d = up; } throw new Error('no playwright'); }
const { chromium } = await import(findPlaywright(ROOT));
const { s, port } = await new Promise((res) => { const sv = createServer(async (rq, rs) => { try { const u = decodeURIComponent((rq.url || '/').split('?')[0]); let f = normalize(join(ROOT, u === '/' ? '/index.html' : u)); if (!f.startsWith(ROOT)) { rs.writeHead(403).end(); return; } const i = await stat(f).catch(() => null); if (i?.isDirectory()) f = join(f, 'index.html'); rs.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(await readFile(f)); } catch { rs.writeHead(404).end(); } }); sv.listen(0, '127.0.0.1', () => res({ s: sv, port: sv.address().port })); });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })).newPage();
await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; try { localStorage.setItem('hearthrise:ftue:completed', '1'); } catch (e) {} });
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.G && !!window._monsterIcon, null, { timeout: 30000 });
await page.waitForTimeout(2600);
await page.evaluate(() => { try { window.showTab('combat'); } catch (e) {} });
await page.waitForTimeout(1200);
await page.evaluate(() => { try { window.startCombat('grave_banshee'); } catch (e) {} });
await page.waitForTimeout(1500);

const r = await page.evaluate(() => {
  const plates = [...document.querySelectorAll('.arena-portrait, .foe-portrait')];
  const el = plates.find((p) => { const i = p.querySelector('img'); return i && /\/monsters\//.test(i.getAttribute('src') || ''); });
  if (!el) return { error: 'no foe plate' };
  const b = el.getBoundingClientRect();
  const cx = Math.round(b.x + b.width / 2), cy = Math.round(b.y + b.height / 2);
  const top = document.elementFromPoint(cx, cy);
  /* Walk from the <img> to <body> collecting anything that could darken. */
  const chain = [];
  for (let n = el.querySelector('img'); n && n !== document.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.opacity !== '1' || cs.filter !== 'none' || cs.mixBlendMode !== 'normal') {
      chain.push((n.className || n.tagName) + ' opacity=' + cs.opacity + ' filter=' + cs.filter + ' blend=' + cs.mixBlendMode);
    }
    const bef = getComputedStyle(n, '::after');
    if (bef && bef.content !== 'none' && bef.backgroundColor && bef.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      chain.push((n.className || n.tagName) + '::after bg=' + bef.backgroundColor);
    }
  }
  return {
    plate: el.className, rect: { x: b.x, y: b.y, w: b.width, h: b.height },
    topElementAtCentre: top ? (top.tagName + '.' + top.className) : null,
    dimmers: chain,
  };
});
console.log(JSON.stringify(r, null, 1));

/* Rendered vs source: mean luminance of the opaque subject, both ways. */
if (!r.error) {
  const shotBuf = await page.screenshot({ clip: r.rect });
  const srcB64 = readFileSync(join(ROOT, 'assets/icons-bundle/hearthfire/monsters/grave_banshee.png')).toString('base64');
  const cmp = await page.evaluate(async ({ shot, src }) => {
    async function mean(dataUrl, alphaGate) {
      const img = new Image(); img.src = dataUrl; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0, sum = 0, max = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (alphaGate && d[i + 3] < 250) continue;
        const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (l < 24) continue;                       // ignore the dark plate/bg
        sum += l; n++; if (l > max) max = l;
      }
      return { mean: +(sum / Math.max(1, n)).toFixed(1), max, n };
    }
    return { rendered: await mean(shot, false), source: await mean(src, true) };
  }, { shot: 'data:image/png;base64,' + shotBuf.toString('base64'), src: 'data:image/png;base64,' + srcB64 });
  console.log('luminance (pixels above 24, subject only for source):', JSON.stringify(cmp));
}
await browser.close(); s.close();
