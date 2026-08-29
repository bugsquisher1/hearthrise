/** SESSION TALLY STRIP — visual pass. Boots index.html headless behind
 *  __HR_TEST_HARNESS__ from a server rooted in THIS checkout, opens the FIGHT
 *  view on a live fight, seeds SETTLED server receipts so the tally renders its
 *  fullest string, and photographs + measures the strip at 1440x900 and 922x423.
 *  Descends from tools/_doll-shots.mjs. */
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const OUT = process.argv[2];
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.webmanifest':'application/manifest+json' };

function findPlaywright(from) {
  let d = from;
  for (let i = 0; i < 8; i++) {
    const p = join(d, 'node_modules', 'playwright', 'index.mjs');
    if (existsSync(p)) return pathToFileURL(p).href;
    const up = normalize(join(d, '..')); if (up === d) break; d = up;
  }
  /* A git worktree is a SIBLING of the main checkout, not a child, so the
     walk-up above never reaches the one node_modules on the machine. Scan the
     siblings of each ancestor before giving up. */
  d = from;
  for (let i = 0; i < 8; i++) {
    const up = normalize(join(d, '..')); if (up === d) break;
    for (const sib of readdirSync(up, { withFileTypes: true })) {
      if (!sib.isDirectory()) continue;
      const p = join(up, sib.name, 'node_modules', 'playwright', 'index.mjs');
      if (existsSync(p)) return pathToFileURL(p).href;
    }
    d = up;
  }
  throw new Error('playwright not found walking up from ' + from);
}
const { chromium } = await import(findPlaywright(ROOT));

function serve(){ return new Promise((res)=>{ const s=createServer(async(rq,rs)=>{ try{ const u=decodeURIComponent((rq.url||'/').split('?')[0]); let f=normalize(join(ROOT, u==='/'?'/index.html':u)); if(!f.startsWith(ROOT)){rs.writeHead(403).end();return;} const i=await stat(f).catch(()=>null); if(i?.isDirectory()) f=join(f,'index.html'); const b=await readFile(f); rs.writeHead(200,{'Content-Type':MIME[extname(f).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'}).end(b);}catch{rs.writeHead(404).end();} }); s.listen(0,'127.0.0.1',()=>res({s,port:s.address().port})); }); }

const { s, port } = await serve();
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const missing = new Set();
const consoleErrors = [];
const report = {};

async function boot({ width, height, tag }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('response', (r) => { if (r.status() === 404) missing.add(new URL(r.url()).pathname); });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[${tag}] ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => consoleErrors.push(`[${tag}] pageerror: ${String(e).slice(0, 200)}`));
  await page.addInitScript(() => {
    window.__HR_TEST_HARNESS__ = true;
    try { localStorage.setItem('hearthrise:ftue:completed', '1'); } catch (e) {}
    try { localStorage.setItem('hearthrise:beta-ack', '1'); } catch (e) {}
  });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.G, null, { timeout: 30000 });
  await page.waitForTimeout(2400);
  return { ctx, page };
}

async function dismiss(page) {
  for (let i = 0; i < 4; i++) {
    const n = await page.evaluate(() => {
      let n = 0;
      document.querySelectorAll('.modal, .modal-backdrop, .overlay, .inv-detail, [class*="daily"], [class*="ftue"], #hr-welcome-modal, #hr-post-signup-modal, .hr-dl-scrim').forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        const r = el.getBoundingClientRect();
        if (r.width * r.height < 10000) return;
        el.remove(); n++;
      });
      return n;
    });
    if (!n) break;
    await page.waitForTimeout(250);
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
}

/** Start a REAL fight so the fight view (and the action bar's Eat button) paint. */
async function startFight(page) {
  await page.evaluate(() => {
    const G = window.G;
    G.gold = 250000;
    try { Object.keys(G.skills || {}).forEach((k) => { G.skills[k].level = 40; }); } catch (e) {}
    /* Cooked food in the bag → the Eat button paints its live two-line label,
       which is the neighbour the tally was reported to collide with. */
    const foodId = Object.keys(window.ITEMS || {}).find((id) => /cooked_shrimp|shrimp/.test(id))
      || Object.keys(window.ITEMS || {}).find((id) => (window.ITEMS[id] || {}).heal > 0);
    if (foodId) { G.inv = G.inv || {}; G.inv[foodId] = 25; }
    try { window.showTab && window.showTab('combat'); } catch (e) {}
    try { window.startCombat && window.startCombat('slime'); } catch (e) {}
  });
  await page.waitForTimeout(1500);
  // force the fight VIEW (the camera), not the war table
  await page.evaluate(() => {
    const p = document.getElementById('panel-combat');
    if (p) p.dataset.combatView = 'fight';
  });
  await page.waitForTimeout(1200);
}

/** Fold SETTLED receipts in so the strip renders its LONGEST honest string:
 *  rates + net + best-settle + a four-foe list. Receipts are the real shape
 *  applyEnvelope writes (serverAuthoritative + awayMs + gains). */
async function seedTally(page, foes) {
  await page.evaluate((nFoes) => {
    const G = window.G;
    G.bestiary = G.bestiary || {};
    const ids = Object.keys(window.MONSTERS || {}).slice(0, nFoes);
    ids.forEach((id, i) => {
      G.bestiary[id] = G.bestiary[id] || { kills: 0 };
      G.bestiary[id].kills = (G.bestiary[id].kills || 0) + (40 - i * 7);
    });
    window.__hrSeedFoes = ids;
  }, foes);
  // three separate settles, so `settles` > 1 and a session BEST exists
  for (const [v, gold, xp, kills, items, ms] of [
    [101, 12840, 41200, 63, 18, 900000],
    [102, 30115, 96550, 141, 44, 1800000],
    [103, 8420, 27310, 39, 9, 600000],
  ]) {
    await page.evaluate((r) => {
      window.G.lastOfflineSummary = {
        serverAuthoritative: true, version: r.v, at: Date.now(),
        awayMs: r.ms, gainedGold: r.gold, gainedXp: r.xp,
        gainedKills: r.kills, gainedItems: r.items, levelUps: ['attack', 'strength'],
      };
    }, { v, gold, xp, kills, items, ms });
    await page.waitForTimeout(450);
  }
  await page.waitForTimeout(900);
}

function overlap(a, b) {
  if (!a || !b) return null;
  const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return (x > 0.5 && y > 0.5) ? { x: Math.round(x), y: Math.round(y) } : null;
}

async function probe(page) {
  const raw = await page.evaluate(() => {
    const R = (sel) => {
      const el = document.querySelector(sel); if (!el) return null;
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return {
        sel, left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        w: Math.round(r.width), h: Math.round(r.height),
        gridRow: cs.gridRowStart, gridCol: cs.gridColumnStart,
        display: cs.display, flexWrap: cs.flexWrap, position: cs.position,
        font: cs.fontSize + '/' + cs.lineHeight, color: cs.color,
        scrollW: el.scrollWidth, clientW: el.clientWidth,
        text: (el.textContent || '').trim().slice(0, 220),
      };
    };
    const span = (sel) => {
      const el = document.querySelector(sel); if (!el) return null;
      const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
      return { sel, color: cs.color, fontSize: cs.fontSize, fontFamily: cs.fontFamily.split(',')[0],
        letterSpacing: cs.letterSpacing, textTransform: cs.textTransform, fontWeight: cs.fontWeight,
        w: Math.round(r.width), overflow: cs.overflow, whiteSpace: cs.whiteSpace,
        display: cs.display, clientW: el.clientWidth, scrollW: el.scrollWidth,
        clipped: el.scrollWidth > el.clientWidth + 1,
        text: (el.textContent || '').trim().slice(0, 90) };
    };
    const stage = document.querySelector('#panel-combat .arena-vs.fs-stage');
    return {
      viewport: { w: innerWidth, h: innerHeight },
      view: (document.getElementById('panel-combat') || {}).dataset ? document.getElementById('panel-combat').dataset.combatView : null,
      fightState: document.getElementById('panel-combat')?.dataset.fightState || null,
      stageRows: stage ? getComputedStyle(stage).gridTemplateRows : null,
      boxes: {
        actionbar: R('#fs-actionbar'),
        eat: R('#arena-act-player .arena-eat'),
        metrics: R('#fs-metrics'),
        session: R('#fs-session'),
        stage: R('#panel-combat .arena-vs.fs-stage'),
        logrow: R('#panel-combat .fs-logrow'),
      },
      spans: {
        head: span('#fs-session .fs-sess-head'),
        stat: span('#fs-session .fs-sess-stat'),
        statB: span('#fs-session .fs-sess-stat b'),
        best: span('#fs-session .fs-sess-best'),
        bestB: span('#fs-session .fs-sess-best b'),
        foes: span('#fs-session .fs-sess-foes'),
        idle: span('#fs-session .fs-sess-idle'),
        mtrB: span('#fs-metrics b'),
        mtrS: span('#fs-metrics s'),
      },
      lines: (() => {
        const el = document.getElementById('fs-session'); if (!el) return null;
        const lh = parseFloat(getComputedStyle(el).lineHeight) || 0;
        return { lineHeight: lh, h: Math.round(el.getBoundingClientRect().height),
          linesApprox: lh ? +(el.getBoundingClientRect().height / lh).toFixed(2) : null };
      })(),
      sessionHTML: (document.getElementById('fs-session') || {}).innerHTML || null,
      docOverflowX: document.documentElement.scrollWidth - innerWidth,
    };
  });
  const b = raw.boxes;
  raw.overlaps = {
    'session×metrics': overlap(b.session, b.metrics),
    'session×actionbar': overlap(b.session, b.actionbar),
    'session×eat': overlap(b.session, b.eat),
    'metrics×actionbar': overlap(b.metrics, b.actionbar),
    'session×logrow': overlap(b.session, b.logrow),
  };
  return raw;
}

async function shot(page, name) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, name + '.png') });
  console.log('  shot -> ' + name + '.png');
}
async function clip(page, name, sel, pad = 6) {
  const box = await page.evaluate((s) => {
    const el = document.querySelector(s); if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, sel);
  if (!box || box.width < 4 || box.height < 4) { console.log('  (no ' + sel + ')'); return null; }
  const vp = page.viewportSize();
  const x = Math.max(0, Math.min(box.x - pad, vp.width - 8));
  const y = Math.max(0, Math.min(box.y - pad, vp.height - 8));
  const width = Math.max(8, Math.min(box.width + pad * 2, vp.width - x));
  const height = Math.max(8, Math.min(box.height + pad * 2, vp.height - y));
  const off = (box.y + box.height > vp.height) || box.y < 0;
  await page.screenshot({ path: join(OUT, name + '.png'), clip: { x, y, width, height } });
  console.log('  clip -> ' + name + '.png (' + Math.round(box.width) + 'x' + Math.round(box.height)
    + ' @y' + Math.round(box.y) + (off ? '  ** OFF-FOLD (viewport h=' + vp.height + ') **' : '') + ')');
  return box;
}

for (const vp of [{ w: 1440, h: 900, t: 'desktop' }, { w: 1920, h: 1080, t: 'wide' }, { w: 1366, h: 768, t: 'laptop' }, { w: 1024, h: 900, t: 'narrowtall' }, { w: 1568, h: 558, t: 'reported' }, { w: 922, h: 423, t: 'landscape' }]) {
  console.log('\n=== ' + vp.t + ' ' + vp.w + 'x' + vp.h + ' ===');
  const { ctx, page } = await boot({ width: vp.w, height: vp.h, tag: vp.t });
  await dismiss(page);
  await startFight(page);
  await dismiss(page);
  report[vp.t + '-idle'] = await probe(page);
  await shot(page, `fight-idle-${vp.t}`);
  await seedTally(page, 4);
  await dismiss(page);
  report[vp.t] = await probe(page);
  await shot(page, `fight-${vp.t}`);
  await clip(page, `strip-${vp.t}`, '#fs-session', 10);
  await clip(page, `bottom-${vp.t}`, '#fs-actionbar', 14);
  /* The reachability net (`.fs-view` scrolls at every height, b371) is how the
     strips are reached on a short screen — so photograph them THERE too, and
     hit-test the Eat button afterwards to prove the strip never lands on it. */
  const scrolled = await page.evaluate(() => {
    const v = document.querySelector('#panel-combat .fs-view');
    if (!v) return null;
    v.scrollTop = v.scrollHeight;
    return { overflowY: getComputedStyle(v).overflowY, scrollTop: v.scrollTop, scrollH: v.scrollHeight, clientH: v.clientHeight };
  });
  await page.waitForTimeout(400);
  report[vp.t + '-scrolled'] = Object.assign({ view: scrolled }, await probe(page));
  await shot(page, `scrolled-${vp.t}`);
  await clip(page, `strip-scrolled-${vp.t}`, '#fs-session', 10);
  const hit = await page.evaluate(() => {
    const out = {};
    for (const [k, sel] of [['eat', '#arena-act-player .arena-eat'], ['stop', '.fs-stop'], ['session', '#fs-session']]) {
      const el = document.querySelector(sel); if (!el) { out[k] = 'missing'; continue; }
      const r = el.getBoundingClientRect();
      const cx = r.x + Math.min(r.width / 2, 40), cy = r.y + r.height / 2;
      const h = (cy >= 0 && cy <= innerHeight) ? document.elementFromPoint(cx, cy) : null;
      out[k] = { y: Math.round(r.y), bottom: Math.round(r.bottom), inView: r.top >= 0 && r.bottom <= innerHeight,
        hit: h ? (h.tagName + '.' + String(h.className).split(' ').slice(0, 2).join('.')) : null };
    }
    return out;
  });
  report[vp.t + '-hit'] = hit;
  console.log('  hit-test: ' + JSON.stringify(hit));
  console.log('  overlaps: ' + JSON.stringify(report[vp.t].overlaps));
  console.log('  session box: ' + JSON.stringify(report[vp.t].boxes.session && {
    y: Math.round(report[vp.t].boxes.session.top), h: report[vp.t].boxes.session.h,
    row: report[vp.t].boxes.session.gridRow, scrollW: report[vp.t].boxes.session.scrollW,
    clientW: report[vp.t].boxes.session.clientW }));
  await ctx.close();
}

await writeFile(join(OUT, 'probe.json'), JSON.stringify(report, null, 2));
console.log('\n404s:', missing.size ? [...missing].join(', ') : 'none');
console.log('console errors:', consoleErrors.length ? '\n  ' + consoleErrors.join('\n  ') : 'none');
await browser.close();
s.close();
