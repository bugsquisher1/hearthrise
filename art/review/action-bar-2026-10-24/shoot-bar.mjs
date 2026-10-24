#!/usr/bin/env node
// art/review/action-bar-2026-10-24/shoot-bar.mjs — the action bar mock on the REAL client, headless.
//   node art/review/action-bar-2026-10-24/shoot-bar.mjs [today|v1|v2 ...]     default: all three
// play.html on the stubbed server the window tests use (tests/_client-harness.mjs); nothing reaches the live
// server. Two states, each the same for every variant:
//   town  the alpha-envelope fixture with the QA hero's Level (38) and no hunt
//   hunt  the hunt-screen fixture: a party of two in the Mill Cellar, mid-fight (hero Level 24)
// Per variant: <v>-town-1440.png, <v>-hunt-1440.png, <v>-hunt-1440-bar.png (the bar alone, at x2 device
// pixels so the pixel art can be judged) and <v>-hunt-922.png (the phone). A variant other than today gets
// bar.css as a same-origin <link> and mock-bar.js run in the page.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, serve, SDK_STUB } from '../../../tests/_client-harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REL = '/art/review/action-bar-2026-10-24/';
const { charXpForLevel } = await import(pathToFileURL(join(ROOT, 'src/core/xp.js')).href);
const { SESSION_CONFIG } = await import(pathToFileURL(join(ROOT, 'src/session/config.js')).href);
const TOWN = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
for (const k of ['hunt', 'party', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'hunt_server_now_ms']) delete TOWN[k];
/* The QA hero in town as the live pane showed it: Level 38, HP 592/592, mana 470 (full). */
TOWN.state = Object.assign({}, TOWN.state, { active_kind: null, active_id: null, hp: 592, max_hp: 592,
  level_xp: Math.round(charXpForLevel(38) + 0.75 * (charXpForLevel(39) - charXpForLevel(38))) });
TOWN.vitals = { max_hp: 592, max_mana: 470 };
const HUNT = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/hunt-envelope.json'), 'utf8'));
HUNT.hunt_server_now_ms += SESSION_CONFIG.huntPlaybackDelayMs;
const MOCK = await readFile(join(HERE, 'mock-bar.js'), 'utf8');

const want = process.argv.slice(2).length ? process.argv.slice(2) : ['today', 'v1', 'v2'];
const SHOTS = (process.env.ONLY_PHONE ? [] : [['town', 1440, 900, 1], ['hunt', 1440, 900, 1], ['hunt', 1440, 900, 2, 'bar']]).concat([['hunt', 922, 423, 1]]);

const { server, port } = await serve();
const browser = await chromium.launch({ headless: true });
let version = 1;
for (const v of want) {
  for (const [state, w, h, dsf, part] of SHOTS) {
    const ENV = state === 'town' ? TOWN : HUNT;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
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
    await page.goto('http://127.0.0.1:' + port + '/play.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('form[data-auth="sign-in"]', { timeout: 20000 });
    await page.fill('input[name=email]', 'qa@example.test');
    await page.fill('input[name=password]', 'not-a-real-password');
    await page.click('.auth-submit');
    await page.click('[data-app="play"][data-slot="0"]');
    await page.waitForSelector('.hb-bar .hb-hub', { timeout: 20000 });
    if (state === 'hunt') await page.waitForFunction(() => document.querySelectorAll('.hp-m').length === 2, null, { timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2500);
    let said = 'today';
    if (v !== 'today') {
      await page.evaluate((href) => new Promise((ok) => { const l = Object.assign(document.createElement('link'), { rel: 'stylesheet', href }); l.onload = ok; l.onerror = ok; document.head.appendChild(l); }), REL + 'bar.css');
      said = await page.evaluate('(' + MOCK + ')(' + JSON.stringify(v) + ')');
      await page.waitForTimeout(600);
    }
    await page.mouse.move(4, 4);
    await page.waitForTimeout(300);
    const name = v + '-' + state + '-' + w + (part ? '-' + part : '') + '.png';
    if (part === 'bar') {
      const r = await page.evaluate(() => { const b = document.querySelector('.hs-widget.is-action-bar').getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
      const pad = 16;
      await page.screenshot({ path: join(HERE, name), clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - 30), width: Math.min(w, r.width + 2 * pad), height: Math.min(h - Math.max(0, r.y - 30), r.height + 30 + pad) } });
    } else await page.screenshot({ path: join(HERE, name) });
    console.log(name + ': ' + said + (errors.length ? ' | page errors: ' + errors.slice(0, 2).join(' | ') : ''));
    await ctx.close();
  }
}
await browser.close();
server.close();
