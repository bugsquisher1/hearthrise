#!/usr/bin/env node
// art/review/ui-options-2026-10-24/shoot-hud.mjs — the IN-HUNT HUD for each option, with no production write.
//   node art/review/ui-options-2026-10-24/shoot-hud.mjs        writes before-hud-1440.png, a-, b-, c-hud-1440.png
// The real client (play.html) on the stubbed server the hunt-screen runner uses (tests/_client-harness.mjs and
// tests/fixtures/hunt-envelope.json: a party of two in the Sewer, the analyzer's numbers, a live log), so the
// QA hero's live hunt is never started for a mock. Unlike the runner it lets Google Fonts load (the shots are
// judged with the real faces). Each option is applied as a <link> to its option.css, same origin, as the
// last stylesheet; 'before' has none.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, serve, SDK_STUB } from '../../../tests/_client-harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REL = 'art/review/ui-options-2026-10-24';
const FIXTURE = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/hunt-envelope.json'), 'utf8'));
FIXTURE.hunt_server_now_ms += (await import(pathToFileURL(join(ROOT, 'src/session/config.js')).href)).SESSION_CONFIG.huntPlaybackDelayMs;
let version = 1;
const next = () => Object.assign(JSON.parse(JSON.stringify(FIXTURE)), { version: ++version });

const { server, port } = await serve();
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', (r) => {
  const name = r.request().url().split('?')[0].split('/').pop();
  const body = name === 'hr_load' ? next() : name === 'hr-accrue' ? Object.assign({ accrued: true }, next()) : { ok: true };
  return r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
});
await page.goto('http://127.0.0.1:' + port + '/play.html', { waitUntil: 'load' });
await page.waitForSelector('form[data-auth="sign-in"], [data-app="play"][data-slot="0"]');
if (await page.$('form[data-auth="sign-in"]')) {
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
}
await page.click('[data-app="play"][data-slot="0"]');
await page.waitForFunction(() => document.querySelectorAll('.hp-m').length === 2
  && document.querySelector('[data-sec="totals"] dd[data-stat="kills"]')?.textContent !== '', null, { timeout: 20000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(2500);   // the scene's sprites and the first log lines
for (const opt of ['before', 'a', 'b', 'c']) {
  await page.evaluate(([rel, o]) => {
    document.getElementById('ui-opt')?.remove();
    if (o === 'before') return null;
    const l = Object.assign(document.createElement('link'), { id: 'ui-opt', rel: 'stylesheet', href: rel + '/' + o + '/option.css?t=' + Date.now() });
    document.head.appendChild(l);
    return new Promise((ok) => { l.onload = ok; l.onerror = ok; });
  }, [REL, opt]);
  await page.waitForTimeout(900);
  const out = join(HERE, opt + '-hud-1440.png');
  await page.screenshot({ path: out });
  console.log('wrote ' + out);
}
console.log(errors.length ? 'page errors: ' + errors.slice(0, 3).join(' | ') : 'no page errors');
await browser.close();
server.close();
