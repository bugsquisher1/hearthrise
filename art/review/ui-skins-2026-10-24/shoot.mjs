#!/usr/bin/env node
// art/review/ui-skins-2026-10-24/shoot.mjs — the Hunts-window skins on the REAL client, headless (Playwright).
//   node art/review/ui-skins-2026-10-24/shoot.mjs [variant ...]   default: every variant below
// play.html on the stubbed server the window tests use (tests/_client-harness.mjs, the alpha-envelope
// fixture), with the live QA hero's numbers: Level 38, in town, its five grounds' bests as the live server
// showed them on 2026-10-24. Nothing reaches the live server. Each variant: the Hunts window, Mosslight Glade
// picked, the SAME content (content-mock.js + content.css: front-facing lineup on ground shadows, drops as
// chance per kill), then the skin's stylesheets as same-origin <link>s (the CSP allows 'self'). Fonts load
// from Google Fonts as in the game. Shots land beside this file.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, serve, SDK_STUB } from '../../../tests/_client-harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REL = '/art/review/ui-skins-2026-10-24/';
const { charXpForLevel } = await import(pathToFileURL(join(ROOT, 'src/core/xp.js')).href);
const ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
/* The live QA hero's numbers: Level 38 and three quarters, its bests (Level XP an hour, balance an hour) on
   the five grounds. In town, so Enter is live (a hero already hunting sees it off). */
for (const k of ['hunt', 'party', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'hunt_server_now_ms']) delete ENV[k];
ENV.state = Object.assign({}, ENV.state, { active_kind: null, active_id: null,
  level_xp: Math.round(charXpForLevel(38) + 0.75 * (charXpForLevel(39) - charXpForLevel(38))) });
const best = (xp, bal) => ({ solo: { xp_h: xp, balance_h: bal }, party: null });
ENV.hunt_bests = { min_ms: 600000, grounds: {
  mill_cellar: best(7087, 1180), meadowbrook_thicket: best(23984, 2850), millrace_sewer: best(66679, 3720),
  mosslight_glade: best(66722, 4612), coppercap_warrens: best(87653, 5210) } };
const MOCK = await readFile(join(HERE, 'content-mock.js'), 'utf8');

/* variant -> [viewport, stylesheets, panel alpha] */
const VARIANTS = {
  'hunts-today-1440': [[1440, 900], [], 1],
  'hunts-skin-1-forged-steel-1440': [[1440, 900], ['layout.css', 's1.css'], 1],
  'hunts-skin-1-forged-steel-1440-drops': [[1440, 900], ['layout.css', 's1.css'], 1, 'drops'],
  'hunts-skin-1-forged-steel-1440-see-through': [[1440, 900], ['layout.css', 's1.css'], 0.6],
  'hunts-skin-1-forged-steel-922': [[922, 423], ['layout.css', 's1.css'], 1, 'name'],
  'hunts-skin-2-carved-stone-1440': [[1440, 900], ['layout.css', 's2.css'], 1],
  'hunts-skin-3-tooled-leather-1440': [[1440, 900], ['layout.css', 's3.css'], 1],
};
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(VARIANTS);

const { server, port } = await serve();
const base = 'http://127.0.0.1:' + port;
const browser = await chromium.launch({ headless: true });
let version = 1;
for (const name of want) {
  const [[w, h], sheets, alpha, scrollTo] = VARIANTS[name];
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', (r) => {
    const fn = r.request().url().split('?')[0].split('/').pop();
    const env = Object.assign(JSON.parse(JSON.stringify(ENV)), { version: ++version });
    const body = fn === 'hr_load' ? env : fn === 'hr-accrue' ? Object.assign({ accrued: true }, env) : { ok: true };
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(base + '/play.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('form[data-auth="sign-in"]', { timeout: 20000 });
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
  await page.click('[data-app="play"][data-slot="0"]');
  await page.waitForSelector('.hs-launchers', { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.evaluate((href) => { const l = Object.assign(document.createElement('link'), { rel: 'stylesheet', href }); document.head.appendChild(l); }, REL + 'content.css');
  await page.click('.hs-launch[data-tip="Hunts"]');
  await page.waitForSelector('.hs-win[data-hs-win="hunts"] .hw-hunt', { timeout: 10000 });
  await page.waitForTimeout(600);
  if (w < 1000) { await page.click('.hw-hunt:has-text("Mosslight Glade")'); await page.waitForTimeout(500); }
  const said = await page.evaluate(MOCK);
  for (const s of sheets) {
    await page.evaluate((href) => new Promise((ok) => { const l = Object.assign(document.createElement('link'), { rel: 'stylesheet', href }); l.onload = ok; l.onerror = ok; document.head.appendChild(l); }), REL + s);
  }
  if (alpha !== 1) await page.evaluate((a) => document.querySelector('.hs-win[data-hs-win="hunts"]').style.setProperty('--panel-alpha', String(a)), alpha);
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(4, h - 4);   /* no hover tooltip in the shot */
  /* 'drops': the page scrolled so "Who lives here" sits at the top: the lineup, the drops and Enter in view. */
  if (scrollTo === 'drops') await page.evaluate(() => { const b = document.querySelector('.hs-win[data-hs-win="hunts"] .hs-win-body');
    const h4 = [...b.querySelectorAll('.hw-hunt-detail:not([hidden]) .hw-hd-h')].find((e) => /Who lives here/i.test(e.textContent));
    b.scrollTop = h4.getBoundingClientRect().top - b.getBoundingClientRect().top - 8; });
  /* 'name': the page scrolled to the ground's own page (the phone's short sheet), its name at the top. */
  if (scrollTo === 'name') await page.evaluate(() => { const b = document.querySelector('.hs-win[data-hs-win="hunts"] .hs-win-body');
    const d = b.querySelector('.hw-hunt-detail:not([hidden]) .hw-hd-name');
    b.scrollTop = d.getBoundingClientRect().top - b.getBoundingClientRect().top - 8; });
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(HERE, name + '.png') });
  console.log(name + ': ' + said + (errors.length ? ' | page errors: ' + errors.slice(0, 2).join(' | ') : ''));
  await ctx.close();
}
await browser.close();
server.close();
