/**
 * Item-detail modal icon probe  ·  Art Director
 * Boots the real index.html from a server rooted in THIS worktree, seeds a bag
 * that contains a hearthfire-wired id, opens the inventory, and reports what
 * the GRID tile drew versus what the DETAIL modal drew for the same id.
 *   node tools/art-modal-probe.mjs [itemId]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const WANT = process.argv[2] || 'wheat_seed';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
function findPlaywright(from) {
  let d = from;
  for (let i = 0; i < 8; i++) { const p = join(d, 'node_modules', 'playwright', 'index.mjs'); if (existsSync(p)) return pathToFileURL(p).href; const up = normalize(join(d, '..')); if (up === d) break; d = up; }
  throw new Error('playwright not found');
}
const { chromium } = await import(findPlaywright(ROOT));
const { s, port } = await new Promise((res) => { const sv = createServer(async (rq, rs) => { try { const u = decodeURIComponent((rq.url || '/').split('?')[0]); let f = normalize(join(ROOT, u === '/' ? '/index.html' : u)); if (!f.startsWith(ROOT)) { rs.writeHead(403).end(); return; } const i = await stat(f).catch(() => null); if (i?.isDirectory()) f = join(f, 'index.html'); rs.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(await readFile(f)); } catch { rs.writeHead(404).end(); } }); sv.listen(0, '127.0.0.1', () => res({ s: sv, port: sv.address().port })); });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 160)));
await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; try { localStorage.setItem('hearthrise:ftue:completed', '1'); } catch (e) {} });
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.G && !!window._itemPath, null, { timeout: 30000 });
await page.waitForTimeout(2600);
/* Clear the beta gate ("I understand — let me play") and any daily-login card
   BEFORE opening the item card: they sit above everything and every capture
   otherwise photographs them instead. */
for (let i = 0; i < 3; i++) {
  const hit = await page.evaluate(() => {
    /* The beta banner's own acknowledger — clicking the button by text did not
       clear it (src/beta-banner.js keeps it until `_ackBetaBanner` runs), so
       call the function the button calls. */
    try { if (window._ackBetaBanner) window._ackBetaBanner(); } catch (e) {}
    const b = [...document.querySelectorAll('button, .btn')].find((n) => /^claim|^continue/i.test((n.textContent || '').trim()));
    if (!b) return false; b.click(); return true;
  });
  if (!hit) break;
  await page.waitForTimeout(600);
}
await page.evaluate(() => { document.querySelectorAll('.hr-dl-scrim, [class*="-scrim"], [class*="beta-banner"], #beta-banner').forEach((n) => n.remove()); });

const r = await page.evaluate((WANT) => {
  const G = window.G;
  G.inventory[WANT] = 12;
  ['normal_log', 'copper_ore', 'shrimp', 'bronze_sword'].forEach((id, i) => { G.inventory[id] = 3 + i; });
  try { window.showTab && window.showTab('inventory'); } catch (e) {}
  return { path: window._itemPath[WANT] || null, renderers: ['renderInvNew', 'renderInvFancy', 'openInvDetail'].filter((f) => typeof window[f] === 'function') };
}, WANT);
await page.waitForTimeout(1600);

const out = await page.evaluate((WANT) => {
  const info = { wantPath: window._itemPath[WANT] || null };
  // What did the GRID draw for this id?
  const tiles = [...document.querySelectorAll('[onclick*="' + WANT + '"]')];
  info.gridTiles = tiles.length;
  const tile = tiles.find((t) => (t.className || '').indexOf('inv') >= 0) || tiles[0];
  if (tile) {
    const img = tile.querySelector('img');
    info.gridImg = img ? img.getAttribute('src') : null;
    info.gridText = (tile.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    info.gridHtmlHead = tile.innerHTML.replace(/\s+/g, ' ').slice(0, 200);
    tile.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
  return info;
}, WANT);
await page.waitForTimeout(900);

const modal = await page.evaluate(() => {
  const d = document.getElementById('inv-detail-overlay');
  if (!d || !d.classList.contains('show')) return { open: false };
  const ic = d.querySelector('.inv-detail-icon');
  const img = ic && ic.querySelector('img');
  const cs = ic ? getComputedStyle(ic) : null;
  const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  return {
    open: true,
    name: (d.querySelector('.inv-detail-name') || {}).textContent,
    iconHtml: ic ? ic.innerHTML.replace(/\s+/g, ' ').slice(0, 220) : null,
    iconImgSrc: img ? img.getAttribute('src') : null,
    iconText: ic ? (ic.textContent || '').trim() : null,
    iconFontSize: cs ? cs.fontSize : null,
    emojiInModal: [...d.querySelectorAll('*')].filter((n) => n.children.length === 0 && emojiRe.test(n.textContent || '')).map((n) => (n.className || n.tagName) + ': ' + n.textContent.trim().slice(0, 24)).slice(0, 10),
  };
});
/* Photograph the card. `openInvDetail` is the LARGEST item render in the game,
   so "the numbers agree" is not the whole verification — look at it. */
const SHOT = process.argv[3];
if (SHOT) {
  /* The daily-login scrim + its "click anywhere to close" banner sit over the
     whole page at ~50% black; without this the capture is a photo of the
     scrim, not of the card. (Same trap as the arena harness.) */
  await page.evaluate(() => { document.querySelectorAll('.hr-dl-scrim, [class*="-scrim"], .hr-dl-card, [class*="daily"]').forEach((n) => n.remove()); });
  await page.waitForTimeout(300);
  const box = await page.evaluate(() => {
    const c = document.querySelector('#inv-detail-overlay .inv-detail-card');
    if (!c) return null; const r = c.getBoundingClientRect();
    return { x: Math.max(0, r.x - 16), y: Math.max(0, r.y - 16), width: r.width + 32, height: r.height + 32 };
  });
  if (box) { await page.screenshot({ path: SHOT, clip: box }); console.log('shot ->', SHOT); }
  else console.log('no card to photograph');
}
console.log('item:', WANT);
console.log('renderers present:', r.renderers.join(', '));
console.log('grid  :', JSON.stringify(out, null, 1));
console.log('modal :', JSON.stringify(modal, null, 1));
await browser.close(); s.close();
