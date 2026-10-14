/** Palette trial walk (lane/b-palette-trial). Boots index.html headless behind
 *  __HR_TEST_HARNESS__ from a server rooted in THIS checkout, seeds a mid-game
 *  save, and photographs five surfaces at 1440x900 under the current palette and
 *  every `body[data-theme-palette]` variant in src/styles/tokens.css, then
 *  composes ONE 4-across sheet per surface (Current | Charcoal | Midnight | Iron).
 *
 *    node tools/_palette-shots.mjs <outDir>            shots + sheets
 *    node tools/_palette-shots.mjs <outDir> --probe    + the painted surfaces, and
 *                                                       what is still warm, per screen
 *    node tools/_palette-shots.mjs <outDir> --vp 922x423   another viewport
 *
 *  At 1440x900 it also writes contrast.png/.json: every text role against every
 *  surface, measured on the rendered pixels.
 *
 *  The World canvas is lit by the map, not by the palette (the --world-* ladder is
 *  never overridden). Its loop keeps running between the four shots of a scene, so
 *  the hunt's foes may stand in different places; the chrome around it is the
 *  comparison. Descends from tools/_home-banner-shots.mjs. A working aid, never a gate. */
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const OUT = process.argv[2];
const PROBE = process.argv.includes('--probe');
/* `--vp WxH` photographs another viewport (the 922x423 landscape phone); default 1440x900. */
const VP = (/^(\d+)x(\d+)$/.exec(process.argv.includes('--vp') ? process.argv[process.argv.indexOf('--vp') + 1] : '') || [0, 1440, 900]).slice(1, 3).map(Number);
if (!OUT) { console.error('usage: node tools/_palette-shots.mjs <outDir> [--probe] [--vp WxH]'); process.exit(2); }
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
  /* Surfaces the grid cannot hit (pointer-events:none, or under the panel), read directly. */
  const pinned = ['#hr-backdrop > div', '.sidebar', '.topbar', '.player-avatar', '.hr-med', '.hd-mile-badge'].map((sel) => {
    const el = document.querySelector(sel); if (!el) return { el: '[pinned] ' + sel, missing: true };
    const cs = getComputedStyle(el); return { el: '[pinned] ' + sel, n: 0, color: cs.backgroundColor, image: cs.backgroundImage.replace(/url\([^)]*\)/g, 'url(…)').slice(0, 220) };
  });
  return pinned.concat([...groups.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 28).map(([k, v]) => ({ el: k, ...v })));
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
    img{display:block;width:960px;height:auto;outline:1px solid #444}
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
const page = await browser.newPage({ viewport: { width: VP[0], height: VP[1] }, deviceScaleFactor: 1 });
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
  await sheet(browser, files, PALETTES.map((p) => p.label), `${sc.label} - ${VP[0]}x${VP[1]}`, join(OUT, `sheet-${sc.id}.png`));
  console.log('sheet', sc.id);
}
/* ── CONTRAST. WCAG 2.x ratio of every text role against the surfaces it is written
   on, as RENDERED: the surface is a 5x5 mean of the shot's pixels (glass, gradients
   and alpha already composited), the text colour is the token as the page resolves
   it under that palette. Points are on empty ground in the 1440x900 shots. ── */
const TEXT = ['--ink', '--ink-2', '--ink-3', '--gold-2', '--gold', '--red-line', '--red', '--green', '--steel'];
const SURF = [
  ['panel floor', 'adventures', 700, 800], ['raised card', 'adventures', 460, 650], ['card (bg-card)', 'bag', 1110, 560],
  ['activity bar', 'adventures', 700, 70], ['sidebar glass', 'adventures', 100, 700], ['topbar glass', 'home', 600, 30],
  ['pane strip', 'adventures', 700, 117], ['lit reward card *', 'home', 480, 504],
];
if (VP[0] === 1440 && VP[1] === 900) {
  const { decodePNG } = await import(pathToFileURL(join(ROOT, 'tools', 'world-art', 'png.mjs')).href);
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const hex = (a) => '#' + a.map((v) => v.toString(16).padStart(2, '0')).join('');
  const imgs = {};
  const at = (file, x, y) => { const img = imgs[file] || (imgs[file] = decodePNG(readFileSync(file))); const s = [0, 0, 0];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const i = ((y + dy) * img.width + x + dx) * 4; s[0] += img.data[i]; s[1] += img.data[i + 1]; s[2] += img.data[i + 2]; }
    return s.map((v) => Math.round(v / 25)); };
  const rows = [];
  for (const pal of PALETTES) {
    const toks = await page.evaluate(({ id, names }) => {
      if (id) document.body.setAttribute('data-theme-palette', id); else document.body.removeAttribute('data-theme-palette');
      const probeEl = document.createElement('i'); document.body.appendChild(probeEl);
      const out = Object.fromEntries(names.map((n) => { probeEl.style.color = `var(${n})`; const m = getComputedStyle(probeEl).color.match(/\d+/g).map(Number); return [n, m.slice(0, 3)]; }));
      probeEl.remove(); return out;
    }, { id: pal.id, names: TEXT });
    for (const [name, screen, x, y] of SURF) {
      const bg = at(join(OUT, `${screen}-${pal.id || 'current'}.png`), x, y);
      rows.push({ pal: pal.label, surface: name, bg: hex(bg), r: TEXT.map((t) => ratio(toks[t], bg)), toks: TEXT.map((t) => hex(toks[t])) });
    }
  }
  await writeFile(join(OUT, 'contrast.json'), JSON.stringify(rows, null, 1));
  /* The lit card carries only these roles (measured on .hd-daily); the rest are shown, dimmed. */
  const ON_LIT = ['--ink-3', '--gold-2'];
  const cell = (v, t, lit) => `<td class="${lit && !ON_LIT.includes(t) ? 'na' : v < 3 ? 'bad' : v < 4.5 ? 'warn' : ''}">${v.toFixed(1)}</td>`;
  const body = rows.map((r, i) => `<tr${i % SURF.length === 0 ? ' class="first"' : ''}><th>${i % SURF.length === 0 ? r.pal : ''}</th><td class="s"><b style="background:${r.bg}"></b>${r.surface} <code>${r.bg}</code></td>${r.r.map((v, j) => cell(v, TEXT[j], r.surface.endsWith('*'))).join('')}</tr>`).join('');
  const swatches = PALETTES.map((p, i) => `<p><strong>${p.label}</strong> ` + rows[i * SURF.length].toks.map((h, j) => `<span><b style="background:${h}"></b>${TEXT[j]} ${h}</span>`).join(' ') + '</p>').join('');
  const cp = await browser.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 1 });
  await cp.setContent(`<!doctype html><html><head><style>
    html,body{margin:0;background:#101010;color:#e8e8e8;font:15px system-ui,sans-serif} body{padding:18px 22px}
    h1{font-size:22px;margin:0 0 4px} .note{color:#aaa;margin:0 0 12px;max-width:1400px}
    table{border-collapse:collapse} th,td{padding:4px 10px;text-align:right;border-bottom:1px solid #2a2a2a}
    th{text-align:left;color:#fff} td.s{text-align:left} thead th{text-align:right;color:#bbb;font-weight:600} thead th:nth-child(-n+2){text-align:left}
    tr.first td,tr.first th{border-top:2px solid #555} td.warn{color:#ffb44a;font-weight:700} td.bad{color:#ff6464;font-weight:700} td.na{color:#555}
    b{display:inline-block;width:14px;height:14px;vertical-align:-2px;margin-right:6px;outline:1px solid #666} code{color:#999}
    p{margin:6px 0} span{margin-right:10px;white-space:nowrap}
  </style></head><body><h1>Palette trial - text contrast (WCAG 2.x), measured on the rendered 1440x900 shots</h1>
  <p class="note">Surface = 5x5 mean of real screenshot pixels on empty ground (glass, gradients and alpha composited). Text = the token as the page resolves it under each palette. AA body text needs 4.5. Orange = under 4.5, red = under 3. * The lit reward card carries only --ink-3 and --gold-2 text (measured on .hd-daily); the other roles never sit on it and are dimmed.</p>
  <table><thead><tr><th>palette</th><th>surface</th>${TEXT.map((t) => `<th>${t}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>${swatches}</body></html>`);
  const dim = await cp.evaluate(() => ({ w: document.body.scrollWidth, h: document.body.scrollHeight }));
  await cp.setViewportSize({ width: dim.w, height: dim.h });
  await cp.screenshot({ path: join(OUT, 'contrast.png') });
  await cp.close();
  console.log('contrast', rows.length, 'rows');
}

await page.evaluate(() => { window.stopCombat && window.stopCombat(); document.body.removeAttribute('data-theme-palette'); });
if (PROBE) await writeFile(join(OUT, 'surfaces.json'), JSON.stringify(probe, null, 1));
await writeFile(join(OUT, 'errors.json'), JSON.stringify(errors, null, 1));
console.log('errors:', errors.length);
await browser.close();
s.close();
