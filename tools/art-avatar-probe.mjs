/** Portrait-source probe (F22).
 *  Boots the real index.html behind __HR_TEST_HARNESS__ from a server rooted in
 *  THIS checkout, changes the portrait, and reads EVERY avatar surface — header
 *  chip, Character hero, Home banner, combat plate — before and after a reload.
 *  Usage: node tools/art-avatar-probe.mjs <outdir>
 */
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const OUT = process.argv[2] || join(ROOT, 'assets/art-pilot/_screenshots/avatar');
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.webmanifest':'application/manifest+json' };

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

function serve(){ return new Promise((res)=>{ const s=createServer(async(rq,rs)=>{ try{ const u=decodeURIComponent((rq.url||'/').split('?')[0]); let f=normalize(join(ROOT, u==='/'?'/index.html':u)); if(!f.startsWith(ROOT)){rs.writeHead(403).end();return;} const i=await stat(f).catch(()=>null); if(i?.isDirectory()) f=join(f,'index.html'); const b=await readFile(f); rs.writeHead(200,{'Content-Type':MIME[extname(f).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'}).end(b);}catch{rs.writeHead(404).end();} }); s.listen(0,'127.0.0.1',()=>res({s,port:s.address().port})); }); }

const { s, port } = await serve();
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const missing = new Set(); const errors = [];
const SIGNED_IN = process.env.HR_SIGNED_IN === '1';
await ctx.addInitScript((signed) => {
  window.__HR_TEST_HARNESS__ = true;
  try {
    localStorage.setItem('hearthrise:ftue:completed', '1');
    localStorage.setItem('hearthrise:beta-ack', '1');
    localStorage.setItem('hearthrise:changelog:lastSeen', '__seen__');
  } catch (e) {}
  if (!signed) return;
  // A synthetic session so the SIGNED-IN portrait path (upload → remote url →
  // hydrateRemoteAvatar) is the one under test. Every network call it makes is
  // intercepted below; nothing leaves the machine.
  const SESS = { access_token: 'probe', refresh_token: 'probe', expires_at: 9e9,
                 user: { id: '00000000-0000-4000-8000-0000000000ab' } };
  const install = () => {
    window.HearthriseAuth = Object.assign(window.HearthriseAuth || {}, {
      getSession: () => SESS,
    });
  };
  install();
  document.addEventListener('DOMContentLoaded', install);
  setInterval(install, 200);
}, SIGNED_IN);
if (SIGNED_IN) {
  await ctx.route('**/storage/v1/object/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"avatars/x"}' }));
  await ctx.route('**/storage/v1/object/public/**', (r) =>
    r.fulfill({ status: 200, contentType: 'image/webp', body: Buffer.from('') }));
  await ctx.route('**/rest/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
}
const page = await ctx.newPage();
page.on('response', (r) => { if (r.status() === 404) missing.add(new URL(r.url()).pathname); });
page.on('requestfailed', (r) => missing.add('FAILED ' + new URL(r.url()).pathname));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 240)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 240)));

const URLB = `http://127.0.0.1:${port}/index.html`;

/** FIRST PAINT: what the header holds the instant the document is parsed —
 *  before identity's deferred boot() could possibly have run. This is the
 *  "shows the CURRENT portrait on FIRST paint" assertion. */
let firstPaint = null;
async function boot() {
  firstPaint = null;
  await page.goto(URLB, { waitUntil: 'domcontentloaded' });
  firstPaint = await page.evaluate(() => {
    const e = document.querySelector('.player-avatar img');
    const s = e ? e.getAttribute('src') : null;
    return s && s.startsWith('data:') ? 'data:' + s.length + ':' + s.slice(-14)
                                      : (s || 'ABSENT').split('/').slice(-2).join('/').split('?')[0];
  });
  await page.waitForFunction(() => !!window.G && !!window.HearthriseIdentity, null, { timeout: 30000 });
  await page.waitForTimeout(2800);            // identity boot is DOMContentLoaded+1200
}

/** A short fingerprint of EVERY <img> in the document that is currently
 *  showing a portrait-shaped source. Enumerated rather than selector-listed,
 *  so a surface nobody remembered still shows up. */
const READ = () => {
  const fp = (s) => {
    if (!s) return null;
    if (s.startsWith('data:')) return 'data:' + s.length + ':' + s.slice(-14);
    return s.split('/').slice(-2).join('/').split('?')[0];
  };
  const where = (el) => {
    let n = el, p = [];
    for (let i = 0; i < 5 && n && n !== document.body; i++, n = n.parentElement) {
      p.unshift(n.id ? '#' + n.id : (n.className && typeof n.className === 'string'
        ? '.' + n.className.trim().split(/\s+/)[0] : n.tagName.toLowerCase()));
    }
    return p.join('>');
  };
  const out = {
    seam: fp(window._playerAvatar),
    identity: fp(window.HearthriseIdentity.avatarUrl()),
    surfaces: {},
  };
  for (const img of document.querySelectorAll('img')) {
    const s = img.getAttribute('src') || '';
    if (!/^data:|avatars\/|npc\/player\.png/.test(s)) continue;
    if (img.closest('.hr-id-grid')) continue;                 // the picker's own tiles
    out.surfaces[where(img)] = fp(img.currentSrc || img.src);
  }
  return out;
};

const log = [];
function note(label, o) {
  if (firstPaint) o = Object.assign({ FIRST_PAINT_header: firstPaint }, o);
  log.push(label + '  ' + JSON.stringify(o)); console.log(label, o);
}
/** Open every panel that draws a portrait, and stage a fight preview so the
 *  arena plates exist. */
async function walk() {
  for (const t of ['character', 'combat', 'profile', 'inventory']) {
    await page.evaluate((n) => { try { window.showTab(n); } catch (e) {} }, t);
    await page.waitForTimeout(450);
  }
  await page.evaluate(() => {
    try { window.showTab('combat'); } catch (e) {}
    try { window.selectMonster && window.selectMonster('slime'); } catch (e) {}
  });
  await page.waitForTimeout(700);
}

await boot();
// Walk the surfaces so they have rendered at least once.
await walk();
note('boot           ', await page.evaluate(READ));

// ── change portrait A ───────────────────────────────────────
await page.evaluate(() => window.HearthriseIdentity.setAvatarFromPrefab('knight'));
await page.waitForTimeout(900);
await walk();
note('after set A    ', await page.evaluate(READ));

await boot();
await walk();
note('reload 1 (A)   ', await page.evaluate(READ));

// ── change portrait B ───────────────────────────────────────
await page.evaluate(() => window.HearthriseIdentity.setAvatarFromPrefab('rogue'));
await page.waitForTimeout(900);
note('after set B    ', await page.evaluate(READ));

await boot();
await walk();
note('reload 1 (B)   ', await page.evaluate(READ));
await boot();
await walk();
note('reload 2 (B)   ', await page.evaluate(READ));

// ── THE VISUAL PASS ─────────────────────────────────────────
// Portrait is 'rogue' at this point, set two reloads ago. Photograph the three
// surfaces the report names, at desktop AND at the landscape phone the mobile
// rules target, and READ them.
/* Ask the PAGE what is on top rather than guessing a selector — the b362
   lesson: guessing costs a whole run, asking costs nothing. */
async function dismiss() {
  // A desktop UA at a phone width raises the "Desktop Site is on" banner. That
  // is CORRECT behaviour and an artifact of an un-emulated device in this
  // probe — a real landscape phone sends a mobile UA and never sees it — so it
  // is cleared rather than photographed over the topbar.
  await page.evaluate(() => {
    const b = document.getElementById('hr-desktopmode-banner');
    if (b) b.remove();
  });
  for (let i = 0; i < 10; i++) {
    const done = await page.evaluate(() => {
      // A sheet is a FIXED element that covers most of the viewport. Deciding by
      // geometry rather than by a selector list is what stops this from eating a
      // panel whose class happens to contain the word "overlay" — which is
      // exactly what a selector-only version of this did on its first run.
      let node = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      let sheet = null;
      while (node && node !== document.body) {
        const cs = getComputedStyle(node);
        const r = node.getBoundingClientRect();
        if (cs.position === 'fixed' && r.width > innerWidth * 0.5 && r.height > innerHeight * 0.5) sheet = node;
        node = node.parentElement;
      }
      if (!sheet) return true;
      const ok = [...sheet.querySelectorAll('button')].reverse()
        .find((b) => /got it|understand|close|not now|cancel|×/i.test(b.textContent || ''));
      if (ok) ok.click(); else sheet.remove();
      return false;
    });
    if (done) return;
    await page.waitForTimeout(300);
  }
}

for (const [tag, w, h] of [['desktop', 1440, 900], ['landscape', 922, 423]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(400);
  /* NOTE: the Home screen's tab name is 'profile' (#panel-profile) — 'home'
     is not a tab, and asking for it leaves whatever was active on screen. */
  for (const [name, tab] of [['home', 'profile'], ['character', 'character'], ['combat', 'combat']]) {
    await page.evaluate((n) => { try { window.showTab(n); } catch (e) {} }, tab);
    await page.waitForTimeout(700);
    await dismiss();
    // The daily-reward sheet lives ON the Home screen and raises itself a beat
    // AFTER the tab opens, so one dismiss pass photographs it anyway.
    await page.waitForTimeout(1200);
    await dismiss();
    await page.screenshot({ path: join(OUT, `${tag}-${name}.png`) });
  }
  // The header chip on its own, at true scale, so a 26px portrait can be judged.
  await dismiss();
  const chip = await page.$('.topbar');
  if (chip) await chip.screenshot({ path: join(OUT, `${tag}-topbar.png`) });
}

await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => { try { window.showTab('profile'); } catch (e) {} });
await page.waitForTimeout(900);
await dismiss();
await page.screenshot({ path: join(OUT, 'desktop-home-profile.png') });
console.log('home hearth banner:', await page.evaluate(() => {
  const e = document.querySelector('.hd-hearth');
  const p = document.getElementById('panel-profile');
  if (!e) return 'no .hd-hearth in the document';
  const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
  return { rect: [r.x | 0, r.y | 0, r.width | 0, r.height | 0], display: cs.display,
           visibility: cs.visibility, opacity: cs.opacity,
           panelDisplay: p ? getComputedStyle(p).display : 'no panel',
           parentChain: (() => { let n = e.parentElement, out = []; while (n && out.length < 6) { out.push((n.id ? '#' + n.id : n.className) + ':' + getComputedStyle(n).display); n = n.parentElement; } return out; })(),
           panelChildren: p ? p.children.length : null };
}));

console.log('\n404s:', [...missing].join(', ') || 'none');
console.log('console errors:', errors.length ? errors.join('\n  ') : 'none');
await writeFile(join(OUT, 'probe.txt'), log.join('\n') + '\n404s: ' + [...missing].join(', ') + '\nerrors: ' + errors.join(' | ') + '\n');
await browser.close(); s.close();
