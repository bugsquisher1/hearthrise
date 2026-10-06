import { chromium } from 'playwright'; import { launchOptions } from '../tests/_chrome.mjs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = normalize('R:/the game/the game/.claude/worktrees/agent-a56886eaebb858d77');
const OUT = 'C:/Users/tyler/AppData/Local/Temp/claude/R--the-game-the-game/3d245d65-7e6e-4b4d-a979-f67be22dc4d7/scratchpad/';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent((req.url || '/').split('?')[0]);
    let f = normalize(join(ROOT, p === '/' ? '/index.html' : p));
    const info = await stat(f).catch(() => null);
    if (info?.isDirectory()) f = join(f, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream' }).end(await readFile(f));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await chromium.launch(launchOptions());
for (const vp of [{ k: 'desk', width: 1440, height: 900 }, { k: 'phone', width: 922, height: 423 }]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => typeof window.G !== 'undefined', { timeout: 60000 });
  await page.evaluate(() => {
    try { if (window.HearthriseGate) window.HearthriseGate.isOpen = () => true; } catch (e) {}
    const G = window.G; G.inventory = G.inventory || {}; G.skills = G.skills || {};
    G.gold = 25000; Object.assign(G.inventory, { normal_log: 400, copper_ore: 120, shrimp: 80, bones: 40 });
    G._serverBag = Object.assign({}, G.inventory);
    G.ftueDone = true; G.ftueStep = 99;
  });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelectorAll('.ftue-root,.ftue-overlay,#ftue-overlay,.dr-overlay,#daily-reward-overlay,.welcome-overlay,#welcome-modal').forEach((e) => e.style.setProperty('display', 'none', 'important')));
  await page.evaluate(() => window.showTab('shops'));
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + vp.k + '-shops.png' });
  await page.evaluate(() => window.showTab('inventory'));
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('[data-item-id],[onclick*="invItemTap"]')).find((e) => /normal_log/.test(e.getAttribute('data-item-id') || e.getAttribute('onclick') || ''));
    const r = t ? t.getBoundingClientRect() : { left: 300, top: 300, width: 0, height: 0 };
    window.HearthriseInvCtx.open('normal_log', r.left + r.width / 2, r.top + r.height / 2);
    const bulk = Array.from(document.querySelectorAll('button')).filter((b) => /sell (selected|junk)|sell all junk/i.test(b.textContent)).map((b) => b.textContent.trim());
    return { tile: !!t, bulk };
  });
  console.log(vp.k, JSON.stringify(info));
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + vp.k + '-ctxmenu.png' });
  await page.evaluate(() => { window.HearthriseInvCtx.close(); window._invSelected = new Set(['normal_log']); window.invSellSelected(); });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ gold: window.G.gold, logs: window.G.inventory.normal_log }));
  console.log(vp.k, 'after invSellSelected', JSON.stringify(after));
  await page.screenshot({ path: OUT + vp.k + '-closed-toast.png' });
  await page.close();
}
await browser.close(); server.close();
