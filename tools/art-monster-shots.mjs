/** HEARTHFIRE MONSTER WAVE 1 — in-game verification harness.
 *  Sibling of tools/art-batch-shots.mjs (items); same three hard-won rules:
 *   · serve from THIS worktree, never the shared launch.json (which is rooted
 *     in the main checkout — the pilot lost twenty minutes photographing a
 *     build that did not contain its own edits);
 *   · COUNT 404s, console errors, broken and tiny <img>, because "the art
 *     looks fine" and "nothing 404'd" are different claims;
 *   · never trust a harness that reports success — assert the surface actually
 *     opened before believing the capture.
 *
 *  One rule of its own, from b357: the ARENA IS NEVER STABLE (a kill replays
 *  the death throe on a loop), so `element.screenshot()` — which waits for
 *  stability — hangs or times out. Every arena capture goes through
 *  page.screenshot({clip}) off a measured rect.
 *
 *    node tools/art-monster-shots.mjs <outDir>
 */
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const OUT = process.argv[2];
if (!OUT) { console.error('usage: art-monster-shots.mjs <outDir>'); process.exit(2); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
function findPlaywright(from) {
  let d = from;
  for (let i = 0; i < 8; i++) { const p = join(d, 'node_modules', 'playwright', 'index.mjs'); if (existsSync(p)) return pathToFileURL(p).href; const up = normalize(join(d, '..')); if (up === d) break; d = up; }
  throw new Error('playwright not found walking up from ' + from);
}
const { chromium } = await import(findPlaywright(ROOT));
const { s, port } = await new Promise((res) => { const sv = createServer(async (rq, rs) => { try { const u = decodeURIComponent((rq.url || '/').split('?')[0]); let f = normalize(join(ROOT, u === '/' ? '/index.html' : u)); if (!f.startsWith(ROOT)) { rs.writeHead(403).end(); return; } const i = await stat(f).catch(() => null); if (i?.isDirectory()) f = join(f, 'index.html'); rs.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(await readFile(f)); } catch { rs.writeHead(404).end(); } }); sv.listen(0, '127.0.0.1', () => res({ s: sv, port: sv.address().port })); });

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const missing = new Set();
const consoleErrors = [];
const audits = [];

async function boot({ width, height, tag }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('response', (r) => { if (r.status() === 404) missing.add(new URL(r.url()).pathname); });
  page.on('requestfailed', (r) => missing.add('FAILED ' + new URL(r.url()).pathname));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[${tag}] ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => consoleErrors.push(`[${tag}] pageerror: ${String(e).slice(0, 200)}`));
  await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; try { localStorage.setItem('hearthrise:ftue:completed', '1'); } catch (e) {} });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.G && !!window._monsterIcon, null, { timeout: 30000 });
  await page.waitForTimeout(2600);
  return { ctx, page };
}

/** Level the player high enough that the whole roster is visible, and unlock
 *  the bestiary rows — a monster list gated to tier 1 proves nothing about 69
 *  portraits that live at tiers 2-6. */
async function seed(page) {
  return page.evaluate(() => {
    const G = window.G;
    G.gold = 5000000;
    try { Object.keys(G.skills || {}).forEach((k) => { if (typeof G.skills[k] === 'object') { G.skills[k].level = 99; G.skills[k].xp = 13034431; } else G.skills[k] = 13034431; }); } catch (e) {}
    try { G.playerMaxHp = 99; G.playerHp = 99; } catch (e) {}
    /* Mark every monster as MET, or the bestiary is 111 rows of "???" and
       proves nothing about 69 portraits. The real shape is
       `G.bestiary[id] = {kills, firstKill}` (legacy.js ~11397) — guessed field
       names silently did nothing on the first pass, which is why this reads
       the shape the game itself writes. */
    try {
      G.bestiary = G.bestiary || {};
      Object.keys(window.MONSTERS || {}).forEach((id) => {
        G.bestiary[id] = G.bestiary[id] || { kills: 0, firstKill: Date.now() };
        G.bestiary[id].kills = Math.max(G.bestiary[id].kills || 0, 25);
      });
    } catch (e) {}
    const icons = window._monsterIcon || {};
    const keys = Object.keys(icons);
    return {
      wiredIcons: keys.length,
      hearthfire: keys.filter((k) => /hearthfire\/monsters\//.test(icons[k])).length,
      roster: Object.keys(window.MONSTERS || {}).length,
    };
  });
}

async function dismiss(page) {
  /* Seeding every skill to 99 fires a RANK UP card that dims the whole screen
     behind a gold border — the first bestiary capture was a beautiful photo of
     a modal. It is not matched by the `.modal/.overlay` sweep below (it uses
     its own class) and it has no close control, only Claim. */
  for (let i = 0; i < 3; i++) {
    const claimed = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button, .btn')].find((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 40 && /^(claim|continue|collect|ok|got it)\b/i.test((b.textContent || '').trim());
      });
      if (!btn) return false; btn.click(); return true;
    });
    if (!claimed) break;
    await page.waitForTimeout(700);
  }
  /* `.hr-dl-scrim` — the daily-login scrim. Claiming the card does NOT remove
     it, and it is not a `.modal`/`.overlay`, so the sweep below walked past
     it: it sat over the whole page at ~50% black and every arena capture came
     out looking like the art had been dimmed. `document.elementFromPoint()` at
     the portrait's centre is what named it; the computed style on the <img>
     said opacity 1 / no filter and would never have found it. */
  await page.evaluate(() => { document.querySelectorAll('.hr-dl-scrim, [class*="-scrim"]').forEach((n) => n.remove()); });

  for (let i = 0; i < 4; i++) {
    const closed = await page.evaluate(() => {
      let n = 0;
      document.querySelectorAll('.modal, .modal-backdrop, .overlay, [class*="daily"], [class*="ftue"]').forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        const r = el.getBoundingClientRect();
        if (r.width * r.height < 10000) return;
        const x = el.querySelector('.modal-close, [aria-label="Close"], button.close, .x, .modal-x');
        if (x) { x.click(); n++; } else { el.remove(); n++; }
      });
      return n;
    });
    if (!closed) break;
    await page.waitForTimeout(400);
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
}

async function shot(page, name, opts = {}) {
  await page.waitForTimeout(opts.wait || 900);
  await page.screenshot({ path: join(OUT, name + '.png'), fullPage: !!opts.full, ...(opts.clip ? { clip: opts.clip } : {}) });
  console.log('  shot -> ' + name + '.png');
}

async function go(page, tab) {
  await page.evaluate((t) => { try { window.showTab && window.showTab(t); } catch (e) {} }, tab);
  await page.waitForTimeout(1300);
  await dismiss(page);
}

/** Ask the PAGE which monster <img> are broken — a 404 listener misses a src
 *  that was never requested, and says nothing about rendered size. */
async function auditImgs(page, label) {
  const r = await page.evaluate(() => {
    const out = { total: 0, monsters: 0, wave1: 0, broken: [], tiny: [], sizes: {} };
    document.querySelectorAll('img').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width < 1 || b.height < 1) return;
      out.total++;
      const src = el.getAttribute('src') || '';
      if (/monsters\//.test(src)) {
        out.monsters++;
        if (/hearthfire\/monsters\//.test(src)) {
          out.wave1++;
          const k = Math.round(b.width) + 'x' + Math.round(b.height);
          out.sizes[k] = (out.sizes[k] || 0) + 1;
        }
      }
      if (el.complete && el.naturalWidth === 0) out.broken.push(src.split('/').slice(-2).join('/'));
      else if (/monsters\//.test(src) && (b.width < 12 || b.height < 12)) out.tiny.push(src.split('/').slice(-1)[0] + ` ${Math.round(b.width)}x${Math.round(b.height)}`);
    });
    return out;
  });
  console.log(`  audit ${label}: ${r.total} imgs, ${r.monsters} monster (${r.wave1} hearthfire), broken ${r.broken.length}, tiny ${r.tiny.length}`
    + '  sizes ' + JSON.stringify(r.sizes)
    + (r.broken.length ? '  BROKEN: ' + r.broken.slice(0, 6).join(', ') : '')
    + (r.tiny.length ? '  TINY: ' + r.tiny.slice(0, 6).join(', ') : ''));
  audits.push([label, r]);
  return r;
}

/** Put a named wave-1 monster in the arena and photograph the plate.
 *  b357: `startCombat(sameId)` TOGGLES THE FIGHT OFF — calling it twice for
 *  the same id silently empties the arena. Always stop first. */
async function arena(page, id, name) {
  await page.evaluate((mid) => {
    /* Belt and braces: the scrim can reappear between captures. */
    document.querySelectorAll('.hr-dl-scrim, [class*="-scrim"]').forEach((n) => n.remove());
    try { window.stopCombat && window.stopCombat(); } catch (e) {}
    try { window.startCombat && window.startCombat(mid); } catch (e) {}
  }, id);
  await page.waitForTimeout(1400);
  const rect = await page.evaluate(() => {
    /* THE FOE side, not the player's. `.arena-portrait` matches BOTH sides and
       the player's comes first in the DOM — the first pass photographed
       `painted/npc/player.png` five times and reported success each time. Pick
       the plate whose <img> is actually a monster portrait. */
    const plates = [...document.querySelectorAll('.arena-portrait, .foe-portrait, .mob-portrait, .monster-portrait')];
    const el = plates.find((p) => { const i = p.querySelector('img'); return i && /\/monsters\//.test(i.getAttribute('src') || ''); });
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const img = el.querySelector('img');
    const ir = img ? img.getBoundingClientRect() : null;
    const cs = img ? getComputedStyle(img) : null;
    return {
      x: Math.max(0, r.x - 24), y: Math.max(0, r.y - 24), width: Math.min(520, r.width + 48), height: Math.min(520, r.height + 48),
      src: img ? img.getAttribute('src') : null,
      imgBox: ir ? Math.round(ir.width) + 'x' + Math.round(ir.height) : null,
      fit: cs ? cs.objectFit : null, radius: cs ? cs.borderRadius : null,
      natural: img ? img.naturalWidth + 'x' + img.naturalHeight : null,
      /* The captures read darker than the source files. Is that the arena's
         dark backdrop behind a cut-out, or is something dimming the art? */
      filter: cs ? cs.filter : null, opacity: cs ? cs.opacity : null,
      mix: cs ? cs.mixBlendMode : null,
      parentOpacity: cs ? getComputedStyle(el).opacity : null,
      parentFilter: cs ? getComputedStyle(el).filter : null,
    };
  });
  if (!rect) { console.log(`  arena ${id}: NO PORTRAIT ELEMENT FOUND`); return null; }
  console.log(`  arena ${id}: src=${rect.src} box=${rect.imgBox} natural=${rect.natural} fit=${rect.fit} radius=${rect.radius} filter=${rect.filter} opacity=${rect.opacity}/${rect.parentOpacity} pfilter=${rect.parentFilter}`);
  await shot(page, name, { clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
  return rect;
}

// ── DESKTOP, hearthlight ───────────────────────────────────────────────
{
  const { ctx, page } = await boot({ width: 1440, height: 900, tag: 'desktop' });
  console.log('desktop:', JSON.stringify(await seed(page)));

  await go(page, 'combat');
  await shot(page, '01-combat-monster-list', { full: true });
  await auditImgs(page, 'combat/monster list');

  /* Arena portraits — the square mask from b357. Five wave-1 subjects with
     very different silhouettes, so a bad crop shows up. */
  for (const [id, n] of [['gnoll', '02-arena-gnoll'], ['mammoth', '03-arena-mammoth'],
    ['wyvern', '04-arena-wyvern'], ['grave_banshee', '05-arena-grave_banshee'], ['cultist', '06-arena-cultist']]) {
    await arena(page, id, n);
  }
  /* The rank-up card RE-FIRES during the fight (kills award XP), so clearing
     it once after seeding is not enough — clear it again immediately before
     the full-screen combat capture. */
  await dismiss(page);
  await page.evaluate(() => { try { window.startCombat && window.startCombat('cultist'); } catch (e) {} });
  await page.waitForTimeout(1200);
  await shot(page, '07-combat-screen-fighting', { full: true });
  await auditImgs(page, 'combat/arena');
  await page.evaluate(() => { try { window.stopCombat && window.stopCombat(); } catch (e) {} });

  /* The bestiary — the shelf test. This is where a mixed art direction or a
     mis-identified portrait is visible and nowhere else. Clear the rank-up
     card FIRST: it cannot be cleared afterwards without taking the bestiary
     with it. */
  await dismiss(page);
  const bestiary = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button, .btn, a, .tab')].find((n) => /bestiary/i.test(n.textContent || ''));
    if (b) { b.click(); return 'clicked'; }
    try { if (window.openBestiary) { window.openBestiary(); return 'openBestiary()'; } } catch (e) {}
    return 'NOT FOUND';
  });
  /* NO dismiss() here. The Bestiary IS a full-screen overlay and dismiss()
     removes any large overlay on sight — the pass that added a rank-up
     claimer promptly deleted the bestiary and photographed the combat panel
     underneath while still reporting "86 portraits on screen". The rank-up
     card is cleared BEFORE the bestiary is opened, above. */
  await page.waitForTimeout(1800);
  const bestiaryShown = await page.evaluate(() => document.querySelectorAll('img[src*="hearthfire/monsters"]').length);
  console.log('  bestiary control: ' + bestiary + ', hearthfire portraits on screen: ' + bestiaryShown);
  await shot(page, '08-bestiary', { full: true });
  await auditImgs(page, 'bestiary');
  await ctx.close();
}

// ── MOBILE LANDSCAPE 922x423 (paione's Ulefone — scaled-desktop layout) ─
{
  const { ctx, page } = await boot({ width: 922, height: 423, tag: 'mobile-landscape' });
  await seed(page);
  await go(page, 'combat');
  await dismiss(page);
  await shot(page, '09-mobile-landscape-combat');

  /* Landscape hides the arena behind a STYLE / FOES / ARENA sub-tab, and the
     sub-tab is NOT a button — it is `data-mobile-sub` on the combat panel
     (the same mechanism the b230 landscape guard drives). Clicking the tab's
     text reported "clicked" and changed nothing; setting the attribute is
     what actually switches the screen. Without it every landscape arena
     capture was a clip of the FOES panel with the plate behind it. */
  const sub = await page.evaluate(() => {
    const p = document.querySelector('#panel-combat, .panel-combat, [id*="combat"]');
    if (!p) return 'no combat panel';
    p.setAttribute('data-mobile-sub', 'arena');
    return p.getAttribute('data-mobile-sub');
  });
  await page.waitForTimeout(700);
  console.log('  mobile sub-tab -> ' + sub);
  await arena(page, 'minotaur', '10-mobile-landscape-arena');
  /* The rank-up card fires again on the first kill; clear it, then re-engage,
     so the landscape capture shows the ARENA and not a modal. */
  await dismiss(page);
  await page.evaluate(() => { try { window.startCombat && window.startCombat('minotaur'); } catch (e) {} });
  await page.waitForTimeout(1200);
  await shot(page, '11-mobile-landscape-fighting');
  await auditImgs(page, 'mobile-landscape');

  /* Landscape puts combat behind STYLE / FOES / ARENA tabs and lands on FOES,
     whose Boss-of-the-Day is a RANDOM id — so the default landscape capture
     may contain no wave-1 art at all (it drew `war_king`, a legacy portrait).
     Clicking the ARENA tab reported "clicked" and changed nothing, which is
     this harness's recurring lesson: verify the RESULT, not the click. So the
     landscape evidence is the BESTIARY — guaranteed to hold this wave, and the
     shelf test is the point anyway. Same ordering rule as desktop: clear the
     rank-up card BEFORE opening, never after. */
  await dismiss(page);
  const mb = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button, .btn, a, .tab')].find((n) => /bestiary/i.test(n.textContent || ''));
    if (b) { b.click(); return 'clicked'; }
    try { if (window.openBestiary) { window.openBestiary(); return 'openBestiary()'; } } catch (e) {}
    return 'NOT FOUND';
  });
  await page.waitForTimeout(1800);
  const mShown = await page.evaluate(() => document.querySelectorAll('img[src*="hearthfire/monsters"]').length);
  console.log('  mobile bestiary: ' + mb + ', hearthfire portraits on screen: ' + mShown);
  await shot(page, '12-mobile-landscape-bestiary');
  await auditImgs(page, 'mobile-landscape/bestiary');
  await ctx.close();
}

await browser.close();
s.close();

const NL = String.fromCharCode(10);
console.log(NL + '── VERDICT ──');
console.log('404 / failed requests: ' + missing.size + (missing.size ? NL + '  ' + [...missing].join(NL + '  ') : ''));
console.log('console errors: ' + consoleErrors.length + (consoleErrors.length ? NL + '  ' + consoleErrors.slice(0, 10).join(NL + '  ') : ''));
const broken = audits.reduce((a, [, r]) => a + r.broken.length, 0);
const tiny = audits.reduce((a, [, r]) => a + r.tiny.length, 0);
const w1 = audits.reduce((a, [, r]) => a + r.wave1, 0);
console.log(`broken <img> across ${audits.length} surfaces: ${broken};  tiny: ${tiny};  hearthfire monster renders: ${w1}`);
process.exit(missing.size || consoleErrors.length || broken || tiny ? 1 : 0);
