/** Palette trial walk (lane/b-palette-trial). Boots index.html headless behind
 *  __HR_TEST_HARNESS__ from a server rooted in THIS checkout, seeds a mid-game
 *  save, and photographs five surfaces at 1440x900 under the current palette and
 *  every `body[data-theme-palette]` variant in src/styles/tokens.css, then
 *  composes ONE 4-across sheet per surface (Current | Charcoal | Midnight | Iron).
 *
 *    node tools/_palette-shots.mjs <outDir>            shots + sheets
 *    node tools/_palette-shots.mjs <outDir> --probe    + the painted surfaces that
 *                                                       are still warm, per screen
 *
 *  The World canvas is lit by the map, not by the palette (the --world-* ladder is
 *  never overridden), so the same frame is held across the four shots of a scene:
 *  the loop is paused and one frame is stepped per shot. Descends from
 *  tools/_home-banner-shots.mjs. A working aid, never a gate. */
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const OUT = process.argv[2];
const PROBE = process.argv.includes('--probe');
if (!OUT) { console.error('usage: node tools/_palette-shots.mjs <outDir> [--probe]'); process.exit(2); }
const PALETTES = [
  { id: '', label: 'Current' },
  { id: 'charcoal', label: 'Charcoal & Gold' },
  { id: 'midnight', label: 'Midnight & Gold' },
  { id: 'iron', label: 'Iron & Gold' },
];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

function findPlaywright(from) {
  let d = from;
  for (let i = 0; i < 8; i++) {
    const p = join(d, 'node_modules', 'playwright', 'index.mjs');
    if (existsSync(p)) return pathToFileURL(p).href;
    const up = normalize(join(d, '..')); if (up === d) break; d = up;
  }
  throw new Error('playwright not found walking up from ' + from);
}
const { chromium } = await import(findPlaywright(ROOT));

function serve() {
  return new Promise((res) => {
    const s = createServer(async (rq, rs) => {
      try {
        const u = decodeURIComponent((rq.url || '/').split('?')[0]);
        let f = normalize(join(ROOT, u === '/' ? '/index.html' : u));
        if (!f.startsWith(ROOT)) { rs.writeHead(403).end(); return; }
        const i = await stat(f).catch(() => null);
        if (i?.isDirectory()) f = join(f, 'index.html');
        const b = await readFile(f);
        rs.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(b);
      } catch { rs.writeHead(404).end(); }
    });
    s.listen(0, '127.0.0.1', () => res({ s, port: s.address().port }));
  });
}

/* The mid-game save visual-qa.mjs photographs, so these sheets show the same game. */
const MID_GAME = () => {
  const G = window.G; if (!G) return;
  if (!G.skills || typeof G.skills !== 'object') G.skills = {};
  if (!G.inventory || typeof G.inventory !== 'object') G.inventory = {};
  G.gold = 250000; G.gems = 40;
  ['attack', 'strength', 'defense', 'hitpoints', 'mining', 'woodcutting', 'fishing', 'cooking', 'smithing', 'crafting', 'farming', 'ranged', 'magic']
    .forEach((s) => { G.skills[s] = 300000; });
  Object.assign(G.inventory, { copper_ore: 500, iron_ore: 400, coal: 300, normal_log: 400, oak_log: 200, shrimp: 200,
    cooked_shrimp: 120, iron_bar: 150, bronze_bar: 120, turnip: 60, dungeon_scrip: 250, bone_key: 3, rune_axe: 1,
    steel_hammer: 1, dawn_sword: 1, dawn_platebody: 1, farm_deed: 4 });
};

const KILL_OVERLAYS = () => {
  document.querySelectorAll('body > *, .panel.active > *').forEach((e) => {
    const c = getComputedStyle(e); if (c.position !== 'fixed' || c.pointerEvents === 'none') return;
    const r = e.getBoundingClientRect();
    if (r.width > innerWidth * 0.6 && r.height > innerHeight * 0.5) e.style.setProperty('display', 'none', 'important');
  });
  document.querySelectorAll('.ftue-root,.ftue-overlay,#ftue-overlay,.modal.open,.qm-overlay,.scv-overlay,.mon-detail.show,.dr-overlay,#daily-reward-overlay,.welcome-overlay,#welcome-modal,.coach-root,.hr-coach')
    .forEach((e) => e.style.setProperty('display', 'none', 'important'));
  document.querySelectorAll('.toast,.toast-wrap,#toast-host,.ach-toast').forEach((e) => { e.style.display = 'none'; });
};

/* Where the painted area of the screen comes from: a 24px grid, the first element
   under each point that paints a background, grouped. Canvas and <img> are art. */
function SURFACES() {
  const rgb = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const nameOf = (el) => {
    const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    const p = el.parentElement; const pc = p ? (p.id ? '#' + p.id : (typeof p.className === 'string' ? '.' + p.className.trim().split(/\s+/)[0] : '')) : '';
    return (pc ? pc + ' > ' : '') + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '');
  };
  const groups = new Map();
  for (let y = 6; y < innerHeight; y += 24) for (let x = 6; x < innerWidth; x += 24) {
    for (const el of document.elementsFromPoint(x, y)) {
      if (el.tagName === 'CANVAS' || el.tagName === 'IMG') { const k = '[art] ' + nameOf(el); groups.set(k, { n: (groups.get(k)?.n || 0) + 1 }); break; }
      const cs = getComputedStyle(el);
      const c = rgb(cs.backgroundColor);
      const img = cs.backgroundImage && cs.backgroundImage !== 'none' ? cs.backgroundImage : '';
      if ((c && c.a > 0.04) || img) {
        const k = nameOf(el);
        const g = groups.get(k) || { n: 0, color: cs.backgroundColor, image: img.replace(/url\([^)]*\)/g, 'url(…)').slice(0, 220) };
        g.n++; groups.set(k, g); break;
      }
    }
  }
  return [...groups.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 28).map(([k, v]) => ({ el: k, ...v }));
}

/* Leftover BROWN: every visible element whose background, border or text resolves
   to a warm low-light colour (hue 15-55, saturation > .15, lightness < .40) or a
   warm-white tint. Gold reads as gold because it is bright; brown is gold without
   the light, so lightness is what separates them. Grouped by element + property. */
function WARM() {
  const hsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return { h: 0, s: 0, l }; const d = mx - mn; const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? ((b - r) / d + 2) : ((r - g) / d + 4); return { h: h * 60, s, l }; };
  const cols = (str) => [...String(str || '').matchAll(/rgba?\(([^)]+)\)/g)].map((m) => { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1, raw: m[0] }; });
  const isBrown = (c) => { if (c.a < 0.04) return false; const { h, s, l } = hsl(c.r, c.g, c.b);
    if (h >= 12 && h <= 55 && s > 0.15 && l < 0.40 && c.a > 0.25) return 'brown';
    if (c.r >= 230 && c.r - c.b >= 30 && c.a <= 0.3 && c.a >= 0.05) return 'warm-tint';
    return false; };
  const nameOf = (el) => {
    const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    const p = el.parentElement; const pc = p ? (p.id ? '#' + p.id : (typeof p.className === 'string' && p.className.trim() ? '.' + p.className.trim().split(/\s+/)[0] : '')) : '';
    return (pc ? pc + ' > ' : '') + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '');
  };
  const hits = new Map();
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('canvas, svg image')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const props = { bg: cs.backgroundColor + ' ' + (cs.backgroundImage.includes('url(') ? '' : cs.backgroundImage), border: cs.borderTopWidth !== '0px' ? cs.borderTopColor : '',
      text: (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) ? cs.color : '', shadow: cs.boxShadow };
    for (const [prop, v] of Object.entries(props)) {
      for (const c of cols(v)) {
        const kind = isBrown(c); if (!kind) continue;
        const k = nameOf(el) + ' | ' + prop + ' | ' + kind;
        const h = hits.get(k) || { n: 0, area: 0, raw: c.raw }; h.n++; h.area += Math.round(r.width * r.height); hits.set(k, h);
      }
    }
  }
  return [...hits.entries()].sort((a, b) => b[1].area - a[1].area).slice(0, 40).map(([k, v]) => ({ k, ...v }));
}

const SCREENS = [
  { id: 'home', label: 'Home', go: async (page) => { await page.evaluate(() => { window.stopCombat && window.stopCombat(); window.showTab('profile'); }); } },
  { id: 'adventures', label: 'Adventures', go: async (page) => { await page.evaluate(() => { window.stopCombat && window.stopCombat(); window.showTab('combat'); }); } },
  { id: 'bag', label: 'Bag', go: async (page) => { await page.evaluate(() => window.showTab('inventory')); } },
  { id: 'world-town', label: 'World - Town', world: true, go: async (page) => {
    await page.evaluate(async () => {
      window.stopCombat && window.stopCombat();
      window.showTab('world');
      const rt = await window.HearthriseWorld.load();
      document.querySelector('#panel-world [data-world-choice="town"]').click();
      rt.step();
    });
  } },
  { id: 'world-hunt', label: 'World - Mill Cellar hunt', world: true, go: async (page) => {
    await page.evaluate(async () => {
      window.startCombat('rat', { confirmed: true });
      window.showTab('world');
      const rt = await window.HearthriseWorld.load();
      for (let i = 0; i < 3; i++) { try { window.combatTick(); } catch (e) {} }
      rt.step();
    });
  } },
];

async function sheet(browser, files, labels, title, out) {
  const page = await browser.newPage({ viewport: { width: 2960, height: 600 }, deviceScaleFactor: 1 });
  const cells = await Promise.all(files.map(async (f, i) => {
    const b64 = (await readFile(f)).toString('base64');
    return `<figure><figcaption>${labels[i]}</figcaption><img src="data:image/png;base64,${b64}"></figure>`;
  }));
  await page.setContent(`<!doctype html><html><head><style>
    html,body{margin:0;background:#101010;color:#e8e8e8;font:600 22px system-ui,sans-serif}
    h1{margin:0;padding:14px 20px 4px;font-size:24px;letter-spacing:.04em}
    main{display:flex;gap:16px;padding:10px 20px 20px;width:max-content}
    figure{margin:0} figcaption{padding:4px 0 8px}
    img{display:block;width:720px;height:450px;outline:1px solid #444}
  </style></head><body><h1>${title}</h1><main>${cells.join('')}</main></body></html>`);
  const dim = await page.evaluate(() => ({ w: document.body.scrollWidth, h: document.body.scrollHeight }));
  await page.setViewportSize({ width: dim.w, height: dim.h });
  await page.screenshot({ path: out });
  await page.close();
}

const { s, port } = await serve();
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
await page.addInitScript(() => {
  window.__HR_TEST_HARNESS__ = true;
  try { localStorage.setItem('hearthrise:ftue:completed', '1'); } catch (e) {}
});
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => typeof window.G !== 'undefined', null, { timeout: 60000 });
await page.evaluate(() => { try { if (window.HearthriseGate) window.HearthriseGate.isOpen = () => true; } catch (e) {} });
await page.evaluate(MID_GAME);
await page.waitForTimeout(2200);
await page.evaluate(() => Promise.all(['Cinzel', 'Alegreya Sans', 'Alegreya Sans SC'].flatMap((f) => [400, 600, 700].map((w) => document.fonts.load(`${w} 16px "${f}"`).catch(() => {})))));
await page.evaluate(() => { try { if (window.G) { window.G.ftueDone = true; window.G.ftueStep = 99; } } catch (e) {} });

const probe = {};
for (const sc of SCREENS) {
  await sc.go(page);
  await page.waitForTimeout(900);
  await page.evaluate(KILL_OVERLAYS);
  const files = [];
  for (const pal of PALETTES) {
    await page.evaluate((id) => {
      if (id) document.body.setAttribute('data-theme-palette', id); else document.body.removeAttribute('data-theme-palette');
    }, pal.id);
    await page.waitForTimeout(350);
    if (sc.world) await page.evaluate(() => { const rt = window.HearthriseWorld.runtime(); if (rt) rt.step(); });
    await page.evaluate(KILL_OVERLAYS);
    const f = join(OUT, `${sc.id}-${pal.id || 'current'}.png`);
    await page.screenshot({ path: f });
    files.push(f);
    if (PROBE) probe[`${sc.id}/${pal.id || 'current'}`] = { surfaces: await page.evaluate(SURFACES), warm: pal.id ? await page.evaluate(WARM) : [] };
  }
  await sheet(browser, files, PALETTES.map((p) => p.label), `${sc.label} - 1440x900`, join(OUT, `sheet-${sc.id}.png`));
  console.log('sheet', sc.id);
}
await page.evaluate(() => { window.stopCombat && window.stopCombat(); document.body.removeAttribute('data-theme-palette'); });
if (PROBE) await writeFile(join(OUT, 'surfaces.json'), JSON.stringify(probe, null, 1));
await writeFile(join(OUT, 'errors.json'), JSON.stringify(errors, null, 1));
console.log('errors:', errors.length);
await browser.close();
s.close();
