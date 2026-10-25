#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/instant-press.mjs — EVERY PRESS ANSWERS AT ONCE, AND ?debug=live (tracker r20, r21).
//
//   node tests/instant-press.mjs            the rules
//   node tests/instant-press.mjs --mutate   every planted defect must turn a rule RED
//
// mutant-anchors: src/shell/press-ack.js src/session/intent-ledger.js src/session/character-session.js src/app/live-overlay.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs);
// the character is tests/fixtures/alpha-envelope.json plus the Services sections.
//   IP-0  PURE: the intent ledger counts an ask open from its call to its settle,
//         keeps the last one's verb, time and verdict, turns a throw into the
//         `network` refusal, and askVia just runs an ask for a holder with no ledger
//   IP-1  PENDING IN THE SAME FRAME: a press on Play (characters screen) and on a
//         Services purchase carries `is-sending` + aria-busy synchronously with
//         the click; the purchase stays pending after the server's answer while
//         the re-read is in flight, and clears once the envelope is applied
//   IP-2  ONE PRESS, ONE ASK: a second click on a control whose ask is in flight
//         reaches no handler
//   IP-3  A REFUSAL SAYS WHY: a refused purchase leaves `is-refused` on the button,
//         no pending state, and the window's message line carries the reason
//   IP-4  NO FALSE PENDING: a press that sends nothing (open a confirmation) is
//         never marked
//   IP-5  ?debug=live ONLY: without it there is no overlay; with it the corner
//         shows the envelope version and age, the last ask's verb and ms, the
//         asks in flight and fps, with zero console errors
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';

const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const SECTIONS = {
  stamina_refill: { available: true, why: null, ms: 0, max_ms: 28800000, restore_ms: 14400000, price: 1400, n: 2, per_day: 6, level: 10 },
  blessings: { held: [1], permille: 320, free_until: 30, tiers: [
    { tier: 1, permille: 320, price: 110, held: true }, { tier: 2, permille: 630, price: 165, held: false },
    { tier: 3, permille: 950, price: 220, held: false }] },
};
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

/* IP-0: the ledger alone (it imports nothing, so node reads it as the browser does). */
async function pure(overrides) {
  const fails = [];
  const src = overrides && overrides['src/session/intent-ledger.js'];
  const url = src ? 'data:text/javascript,' + encodeURIComponent(src) : pathToFileURL(join(ROOT, 'src/session/intent-ledger.js')).href;
  const { createIntentLedger, askVia } = await import(url);
  let t = 0;
  const L = createIntentLedger({ now: () => t });
  const seen = [];
  L.subscribe((k, e) => seen.push(k + ':' + e.verb));
  let release;
  const p = L.track('bank_move', () => new Promise((ok) => { release = ok; }));
  if (L.open() !== 1) fails.push('IP-0 an ask in flight is not counted open');
  t = 420;
  release({ ok: true });
  await p;
  if (L.open() !== 0) fails.push('IP-0 a settled ask is still counted open');
  const last = L.last();
  if (!last || last.verb !== 'bank_move' || last.ms !== 420 || last.ok !== true) fails.push('IP-0 the last ask reads ' + JSON.stringify(last));
  const r = await L.track('eat', async () => { throw new Error('offline'); });
  if (!r || r.ok !== false || r.error !== 'network' || L.last().error !== 'network') fails.push('IP-0 a throw is not the network refusal: ' + JSON.stringify(r));
  if (seen.join(',') !== 'begin:bank_move,end:bank_move,begin:eat,end:eat') fails.push('IP-0 the events read ' + seen.join(','));
  if ((await askVia({}, 'x', async () => ({ ok: 7 }))).ok !== 7) fails.push('IP-0 askVia without a ledger did not just run the ask');
  return fails;
}

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    s.calls.push(name);
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load') { if (s.loadDelay) await sleep(s.loadDelay); return json(Object.assign(clone(s.env), { version: ++s.version, ok: true })); }
    if (name === 'hr-accrue') return json(Object.assign(clone(s.env), { version: ++s.version, ok: true }));
    if (name === 'hr_blessing_buy') {
      await sleep(300);
      s.answered = true;
      return json(s.refuse ? { ok: false, error: 'quote_changed' } : { ok: true });
    }
    return json({ ok: true });
  });
}

async function checks(overrides) {
  const fails = await pure(overrides);
  if (overrides && fails.length) return fails;   // a mutant already caught needs no browser
  const { server, port } = await serve(overrides);
  const browser = await leaseBrowser(chromium);
  const base = 'http://127.0.0.1:' + port;
  const start = async (query) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const s = { env: Object.assign(clone(BASE_ENV), clone(SECTIONS)), version: 1, calls: [], loadDelay: 0 };
    await stub(page, s);
    await page.goto(base + '/play.html' + query, { waitUntil: 'load' });
    await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
    await page.fill('input[name=email]', 'qa@example.test');
    await page.fill('input[name=password]', 'not-a-real-password');
    await page.click('.auth-submit');
    const roster = await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
    return { ctx, page, errors, s, roster };
  };
  const servicesBtn = (q) => '[data-hs-win="shop"] [data-pane="services"] ' + q;
  try {
    {
      const { ctx, page, errors, s, roster } = await start('');
      if (!roster) fails.push('IP-1 the characters screen never showed Play');
      else {
        // IP-1 (Play) + IP-2: the open is in flight for 400 ms; the second click reaches nothing.
        s.loadDelay = 400;
        const play = await page.evaluate(() => {
          const b = document.querySelector('[data-app="play"][data-slot="0"]');
          b.click();
          const now = { sending: b.classList.contains('is-sending'), busy: b.getAttribute('aria-busy') };
          let reached = 0;
          const count = () => { reached++; };
          document.addEventListener('click', count);
          b.click();
          document.removeEventListener('click', count);
          return Object.assign(now, { reached });
        });
        if (!play.sending || play.busy !== 'true') fails.push('IP-1 Play was not pending in the frame it was pressed: ' + JSON.stringify(play));
        if (play.reached !== 0) fails.push('IP-2 a second click on Play in flight reached a handler');
        s.loadDelay = 0;
        if (!(await wait(page, () => document.querySelector('.hs-launchers')))) fails.push('IP-1 the game never opened after Play');
        await page.keyboard.press('r');
        if (!(await wait(page, () => document.querySelector('[data-hs-win="shop"] [data-pane="services"] .hw-services'), null, 4000))) fails.push('IP-1 Services did not open');
        else {
          // IP-4: opening a confirmation sends nothing and is never marked.
          const ask = await page.evaluate((q) => { const b = document.querySelector(q); b.click(); return b.classList.contains('is-sending'); }, servicesBtn('[data-hs-act="stam-ask"]'));
          await sleep(120);
          if (ask || await page.evaluate((q) => document.querySelector(q).classList.contains('is-sending'), servicesBtn('[data-hs-act="stam-ask"]'))) fails.push('IP-4 a press that sends nothing was marked pending');
          await page.evaluate((q) => { const b = document.querySelector(q); if (b) b.click(); }, servicesBtn('[data-hs-act="stam-no"]'));
          // IP-1 (purchase): pending at once, still pending while the re-read is in flight, clear after it.
          s.loadDelay = 700;
          const bless = servicesBtn('[data-hs-act="bless"][data-tier="2"]');
          const at = await page.evaluate((q) => { const b = document.querySelector(q); b.click(); return { sending: b.classList.contains('is-sending'), busy: b.getAttribute('aria-busy') }; }, bless);
          if (!at.sending || at.busy !== 'true') fails.push('IP-1 the purchase was not pending in the frame it was pressed: ' + JSON.stringify(at));
          for (let i = 0; i < 40 && !s.answered; i++) await sleep(25);
          await sleep(250);
          if (!(await page.evaluate((q) => document.querySelector(q).classList.contains('is-sending'), bless))) fails.push('IP-1 the purchase stopped pending before the re-read envelope arrived');
          if (!(await wait(page, (q) => !document.querySelector(q).classList.contains('is-sending') && !document.querySelector(q).hasAttribute('aria-busy'), bless, 4000))) fails.push('IP-1 the purchase stayed pending after the envelope');
          s.loadDelay = 0;
          // IP-3: a refusal.
          s.answered = false;
          s.refuse = true;
          await page.evaluate((q) => document.querySelector(q).click(), bless);
          const refused = await wait(page, (q) => document.querySelector(q).classList.contains('is-refused'), bless, 3000);
          const after = await page.evaluate((q) => ({ sending: document.querySelector(q).classList.contains('is-sending'),
            msg: document.querySelector('[data-hs-win="shop"] [data-pane="services"] .hh-intent-msg').textContent }), bless);
          if (!refused) fails.push('IP-3 a refused purchase left no refused mark on its button');
          if (after.sending) fails.push('IP-3 a refused purchase stayed pending');
          if (!/Prices or your bag changed/.test(after.msg)) fails.push('IP-3 the window does not say why: ' + JSON.stringify(after.msg));
        }
        if (await page.evaluate(() => !!document.querySelector('[data-live-overlay]'))) fails.push('IP-5 the overlay shows without ?debug=live');
        if (errors.length) fails.push('IP-1 console errors: ' + errors.join(' | ').slice(0, 300));
      }
      await ctx.close();
    }
    { // IP-5
      const { ctx, page, errors, s, roster } = await start('?debug=live');
      if (!roster) fails.push('IP-5 the characters screen never showed Play');
      else {
        await page.click('[data-app="play"][data-slot="0"]');
        await wait(page, () => document.querySelector('.hs-launchers'));
        await page.keyboard.press('r');
        await wait(page, () => document.querySelector('[data-hs-win="shop"] [data-pane="services"] .hw-services'), null, 4000);
        await page.click('[data-hs-win="shop"] [data-pane="services"] [data-hs-act="bless"][data-tier="2"]');
        await wait(page, () => /blessing_buy/.test((document.querySelector('[data-live-overlay]') || {}).textContent || ''), null, 4000);
        await sleep(1100);
        const lines = await page.evaluate(() => [...document.querySelectorAll('[data-live-overlay] p')].map((p) => p.textContent));
        const all = lines.join(' | ');
        if (!/^env v\d+ · [\d.]+ s ago$/.test(lines[0] || '')) fails.push('IP-5 the envelope line reads ' + JSON.stringify(lines[0]));
        if (!/^ask blessing_buy \d+ ms ok$/.test(lines[1] || '')) fails.push('IP-5 the ask line reads ' + JSON.stringify(lines[1]));
        if (lines[2] !== 'open 0') fails.push('IP-5 the in-flight line reads ' + JSON.stringify(lines[2]));
        if (!/^fps \d+$/.test(lines[4] || '')) fails.push('IP-5 the fps line reads ' + JSON.stringify(lines[4]));
        const look = await page.evaluate(() => { const o = document.querySelector('[data-live-overlay]'); const cs = getComputedStyle(o.querySelector('p'));
          return { px: parseFloat(cs.fontSize), events: getComputedStyle(o).pointerEvents }; });
        if (!(look.px >= 12) || look.events !== 'none') fails.push('IP-5 the overlay is ' + JSON.stringify(look) + ' (text >= 12 px, never takes a press)');
        if (errors.length) fails.push('IP-5 console errors: ' + errors.join(' | ').slice(0, 300) + ' [' + all + ']');
        if (!s.calls.includes('hr_blessing_buy')) fails.push('IP-5 the purchase was never sent');
      }
      await ctx.close();
    }
  } catch (e) {
    fails.push('IP-1 the page broke: ' + String((e && e.message) || e).split('\n')[0]);
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

const MUTANTS = [
  ['the pressed control is never marked', 'src/shell/press-ack.js', 'if (p.open === 1) mark(p.el, true);', ''],
  ['the ask settles on the answer, before the re-read', 'src/session/character-session.js',
    '_ask(verb, send, carries) { return this.intents.track(verb, async () => this._settled(await send(), carries === true)); }',
    '_ask(verb, send, carries) { return this.intents.track(verb, send).then((a) => this._settled(a, carries === true)); }'],
  ['a second click in flight goes through', 'src/shell/press-ack.js', 'e.stopImmediatePropagation();\n      return;', 'return;'],
  ['the overlay shows for everyone', 'src/app/live-overlay.js', "return new URLSearchParams(String(search || '')).get('debug') === 'live';", 'return true;'],
  ['the ledger forgets to close an ask', 'src/session/intent-ledger.js', '      open.delete(entry.id);\n', ''],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'instant-press: ' + fails.length + ' rule(s) RED'
      : 'instant-press: a press is pending in its own frame until the re-read, once; a refusal is marked and worded; ?debug=live only');
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await checks(null);
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  let bad = 0;
  for (const [name, file, from, to] of MUTANTS) {
    const text = (await readFile(join(ROOT, file), 'utf8')).replace(/\r\n/g, '\n');
    if (!text.includes(from)) { console.log('  ✗ ' + name + ' — anchor not found in ' + file); bad++; continue; }
    const fails = await checks({ [file]: text.replace(from, to) });
    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  console.log(bad ? 'instant-press --mutate: ' + bad + ' escaped' : 'instant-press --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

main();
