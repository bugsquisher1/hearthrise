// ============================================================
// tests/visual-qa.mjs — the PLAYER'S-EYE pass (b284)
//
// Why this exists: the studio review was code-only, so it could not see that
// text was chopped in half, that content ran under a fixed bar, or that half a
// panel was empty. The in-app Browser pane can't screenshot here (it isn't
// composited), but the smoke runner already drives a REAL headless Chromium —
// so this reuses that substrate to walk every screen at desktop AND landscape
// phone size, capture a PNG of each, and measure the bug classes a player
// notices instantly:
//
//   clipped text · content under fixed bars · horizontal spill · tiny tap
//   targets · wasted space · duplicated/contradictory/broken copy ·
//   emoji used as artwork · dead (unwired) controls
//
//   node tests/visual-qa.mjs [--url http://localhost:8123]
//
// Writes PNGs + findings.json to docs/reports/visual-qa/ and prints a summary.
// Exit code is always 0 — this is a REPORT, not a gate (run-smoke.mjs gates).
// ============================================================

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const OUT = join(ROOT, 'docs', 'reports', 'visual-qa');
const argv = process.argv.slice(2);
const argOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const EXTERNAL_URL = argOf('--url');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

function serve() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const p = decodeURIComponent((req.url || '/').split('?')[0]);
        let f = normalize(join(ROOT, p === '/' ? '/index.html' : p));
        if (!f.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
        const info = await stat(f).catch(() => null);
        if (info?.isDirectory()) f = join(f, 'index.html');
        const body = await readFile(f);
        res.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
      } catch { res.writeHead(404).end('not found'); }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const VIEWPORTS = [
  { key: 'desktop', width: 1440, height: 900 },
  { key: 'landscape', width: 852, height: 393 },
];
const SCREENS = ['profile', 'character', 'combat', 'skills', 'farming', 'inventory', 'house', 'events', 'shops', 'clan', 'social', 'bounty'];

// Injected into the page — runs against a REAL rendered layout.
function SWEEP(label) {
  const vw = innerWidth, out = { screen: label, vw, vh: innerHeight, issues: [], stats: {} };
  const add = (sev, kind, detail, el) => out.issues.push({ sev, kind, detail,
    el: el ? ((el.id ? '#' + el.id : '') + '.' + (String(el.className || '').split(' ')[0] || el.tagName)).slice(0, 44) : '' });
  const vis = (el) => { const c = getComputedStyle(el); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.05) return false;
    // Screen-reader-only text (the standard 1px/clip-path pattern) is deliberately
    // invisible — counting it as "clipped" is a false positive.
    if (c.clipPath === 'inset(50%)' || (c.position === 'absolute' && c.overflow === 'hidden' && el.getBoundingClientRect().width <= 2)) return false;
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const TXT = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const panel = document.querySelector('.panel.active') || document.body;
  // Chrome (nav rail, topbar, activity bar) lives OUTSIDE the active panel — sweeping
  // only the panel is how the sliced "CHARACTER" rail label went unnoticed.
  const chrome = [...document.querySelectorAll('.bottom-nav, .sidebar, .topbar, #activity-bar')];
  const scope = [panel, ...chrome].filter(Boolean);
  const all = scope.flatMap((n) => [...n.querySelectorAll('*')]).filter(vis);
  out.stats = { els: all.length, chars: TXT(panel).length };

  all.forEach((el) => {
    if (el.children.length) return;
    const t = TXT(el); if (!t) return;
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible')
      add('P1', 'clipped-text', `"${t.slice(0, 30)}" (${el.scrollWidth}>${el.clientWidth})`, el);
    const r = el.getBoundingClientRect(); let p = el.parentElement;
    while (p && p !== document.body) {
      const pc = getComputedStyle(p);
      if (pc.overflow === 'hidden' || pc.overflowX === 'hidden') {
        const pr = p.getBoundingClientRect();
        if (r.right > pr.right + 2 || r.left < pr.left - 2) { add('P1', 'clipped-by-parent', `"${t.slice(0, 26)}" cut by .${String(p.className).split(' ')[0]}`, el); break; }
      }
      p = p.parentElement;
    }
  });

  // A "bar" is a real chrome strip (topbar/activity bar/nav) — NOT a decorative
  // full-screen backdrop or a pointer-transparent overlay, which would make every
  // element on the page look "covered".
  const bars = [...document.querySelectorAll('body *')].filter((e) => {
    if (!vis(e)) return false;
    const c = getComputedStyle(e); if (!['fixed', 'sticky'].includes(c.position)) return false;
    if (c.pointerEvents === 'none') return false;
    const r = e.getBoundingClientRect();
    if (r.height <= 14 || r.width <= vw * 0.4) return false;
    if (r.height > innerHeight * 0.35) return false;      // full-screen layer, not a bar
    return true;
  });
  bars.forEach((b) => { const br = b.getBoundingClientRect();
    all.forEach((el) => { if (el.children.length || b.contains(el)) return; const t = TXT(el); if (!t) return;
      const r = el.getBoundingClientRect(); if (r.height < 4) return;
      const ov = Math.min(r.bottom, br.bottom) - Math.max(r.top, br.top);
      if (ov > 3 && r.left < br.right && r.right > br.left)
        add('P1', 'under-fixed-bar', `"${t.slice(0, 24)}" ${ov | 0}px under .${String(b.className).split(' ')[0] || b.id}`, el); }); });

  all.forEach((el) => { const r = el.getBoundingClientRect();
    if (r.width > 2 && (r.right > vw + 2 || r.left < -2)) add('P1', 'offscreen-x', `${Math.round(r.right - vw)}px past right`, el); });

  const small = [];
  scope.forEach((n) => n.querySelectorAll('button,.btn,.chip,[onclick]').forEach((el) => { if (!vis(el)) return;
    const r = el.getBoundingClientRect(); if (r.height < 44) small.push(Math.round(r.height)); }));
  if (small.length) add(vw <= 900 ? 'P1' : 'P3', 'small-target', `${small.length} controls <44px (min ${Math.min(...small)}px)`, panel);

  const pr = panel.getBoundingClientRect(); let maxRight = 0, maxBottom = 0;
  all.forEach((el) => { const r = el.getBoundingClientRect(); if (r.width > 4 && r.height > 4) { maxRight = Math.max(maxRight, r.right); maxBottom = Math.max(maxBottom, r.bottom); } });
  const unusedR = pr.right - maxRight;
  if (all.length && unusedR > pr.width * 0.25 && pr.width > 500)
    add('P2', 'wasted-space', `${Math.round(unusedR)}px (${Math.round(unusedR / pr.width * 100)}%) of width unused`, panel);

  const txt = TXT(panel);
  const dup = txt.match(/\b(\w{3,})\s+\1\b/i); if (dup) add('P2', 'duplicate-word', `"${dup[0]}"`, panel);
  if (/0%\s*·?\s*watered/i.test(txt)) add('P2', 'contradictory-copy', '"0% · watered"', panel);
  const broken = txt.match(/\S*(NaN|undefined|\[object Object\])\S*/i);
  if (broken) add('P1', 'broken-value', broken[0].slice(0, 40), panel);

  all.forEach((el) => { if (el.children.length) return; const t = TXT(el);
    if (t.length <= 3 && /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(t)) {
      const fs = parseFloat(getComputedStyle(el).fontSize) || 0;
      if (fs >= 26) add('P1', 'emoji-as-art', `${fs | 0}px "${t}"`, el); } });

  return out;
}

const MID_GAME = () => {
  const G = window.G; if (!G) return;
  G.gold = 250000; G.gems = 40;
  ['attack','strength','defense','hitpoints','mining','woodcutting','fishing','cooking','smithing','crafting','farming','ranged','magic']
    .forEach((s) => { G.skills[s] = 300000; });
  Object.assign(G.inventory, { copper_ore:500, iron_ore:400, coal:300, normal_log:400, oak_log:200, shrimp:200,
    cooked_shrimp:120, iron_bar:150, bronze_bar:120, turnip:60, dungeon_scrip:250, bone_key:3, rune_axe:1,
    steel_hammer:1, dawn_sword:1, dawn_platebody:1, farm_deed:4 });
};

(async () => {
  const { server, port } = EXTERNAL_URL ? { server: null, port: 0 } : await serve();
  const url = EXTERNAL_URL || `http://127.0.0.1:${port}/index.html`;
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const findings = [];

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(() => typeof window.G !== 'undefined', { timeout: 60_000 });
    await page.evaluate(() => { try { if (window.HearthriseGate) window.HearthriseGate.isOpen = () => true; } catch (e) {} });
    await page.evaluate(MID_GAME);
    await page.waitForTimeout(1800);   // let ESM merge + icon mapping settle
    // Dismiss the FTUE tour + any open modal/toast, or every screen gets measured
    // (and screenshotted) from BEHIND the tutorial — the sweep would be worthless.
    await page.evaluate(() => {
      try { if (window.G) { window.G.ftueDone = true; window.G.ftueStep = 99; if (window.G.flags) window.G.flags.ftue = 'done'; } } catch (e) {}
      // Generic: ANY element that is a full-viewport interactive overlay (tutorial,
      // daily reward, welcome, what's-new) is dismissed — otherwise every screen is
      // measured and screenshotted from behind a modal.
      const killOverlays = () => {
        document.querySelectorAll('body > *, .panel.active > *').forEach((e) => {
          const c = getComputedStyle(e); if (c.position !== 'fixed' || c.pointerEvents === 'none') return;
          const r = e.getBoundingClientRect();
          if (r.width > innerWidth * 0.6 && r.height > innerHeight * 0.5) e.style.setProperty('display', 'none', 'important');
        });
        document.querySelectorAll('.ftue-root,.ftue-overlay,#ftue-overlay,.modal.open,.qm-overlay,.scv-overlay,.mon-detail.show,.dr-overlay,#daily-reward-overlay,.welcome-overlay,#welcome-modal')
          .forEach((e) => e.style.setProperty('display', 'none', 'important'));
        document.querySelectorAll('.toast,.toast-wrap,#toast-host').forEach((e) => { e.style.display = 'none'; });
      };
      killOverlays(); window.__killOverlays = killOverlays;
    });
    await page.waitForTimeout(300);

    for (const s of SCREENS) {
      await page.evaluate((t) => { try { if (typeof window.showTab === 'function') window.showTab(t); } catch (e) {} }, s);
      await page.waitForTimeout(500);
      await page.evaluate(() => { try { window.__killOverlays && window.__killOverlays(); } catch (e) {} });
      await page.waitForTimeout(120);
      const res = await page.evaluate(SWEEP, s).catch((e) => ({ screen: s, issues: [{ sev: 'ERR', kind: 'sweep-threw', detail: String(e).slice(0, 120) }], stats: {} }));
      res.viewport = vp.key;
      findings.push(res);
      await page.screenshot({ path: join(OUT, `${vp.key}-${s}.png`) }).catch(() => {});
    }
    await page.close();
  }
  await browser.close();
  if (server) server.close();

  await writeFile(join(OUT, 'findings.json'), JSON.stringify(findings, null, 2));
  const bySev = {};
  findings.forEach((f) => f.issues.forEach((i) => { bySev[i.sev] = (bySev[i.sev] || 0) + 1; }));
  console.log('\nVISUAL QA — screens:', findings.length, '| issues by severity:', JSON.stringify(bySev));
  findings.forEach((f) => {
    const hot = f.issues.filter((i) => i.sev === 'P1' || i.sev === 'ERR');
    if (hot.length) { console.log(`\n[${f.viewport}/${f.screen}] els=${f.stats.els} chars=${f.stats.chars}`);
      hot.slice(0, 6).forEach((i) => console.log(`   ${i.sev} ${i.kind}: ${i.detail} ${i.el}`)); }
  });
  console.log('\nPNGs + findings.json →', OUT);
})();
