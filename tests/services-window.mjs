#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/services-window.mjs — THE SERVICES WINDOW'S RULES, IN A REAL CHROMIUM (lane S2).
//
//   node tests/services-window.mjs            the rules
//   node tests/services-window.mjs --mutate   every planted defect must turn a rule RED
//
// mutant-anchors: src/shell/windows/services.js src/session/item-sections.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs);
// the character is tests/fixtures/alpha-envelope.json plus the two S2 sections.
//   SV-1  Services opens from its key (R) with zero console errors
//   SV-2  STAMINA, TOTAL FIRST: the server's quote (hours, price, today's count)
//         is shown; Buy only opens a confirmation (nothing sent); confirming sends
//         exactly ONE hr_stamina_refill carrying the QUOTED price, and every
//         control is off until the server answers
//   SV-3  BLESSINGS IN ORDER: an owned tier reads Owned, only the next missing tier
//         can be bought (at its quoted price), a later one says what it needs; the
//         press is ONE hr_blessing_buy (tier, quoted price); "free until 30" and
//         "uses them all up" are said
//   SV-4  NO FREE NAME: the window has no name box and never sends
//         hr_character_name_set (Tyler 10-22: a new name costs gold; it is the
//         Characters window's Rename, tests/hero-rename-client.mjs)
//   SV-5  FAIL SAFE: with no stamina_refill / blessings sections the purchase
//         controls stay off and the window says the server has not priced them
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';

const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const SECTIONS = {
  stamina_refill: { available: true, why: null, ms: 0, max_ms: 28800000, restore_ms: 14400000, price: 1400, n: 2, per_day: 6, level: 10 },
  blessings: { held: [1], permille: 320, free_until: 30, tiers: [
    { tier: 1, permille: 320, price: 110, held: true }, { tier: 2, permille: 630, price: 165, held: false },
    { tier: 3, permille: 950, price: 220, held: false }] },
};
const RPCS = ['hr_stamina_refill', 'hr_blessing_buy'];
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load' || name === 'hr-accrue') return json(Object.assign(clone(s.env), { version: ++s.version, ok: true }));
    if (RPCS.includes(name)) { await new Promise((ok) => setTimeout(ok, 400)); return json({ ok: true }); }
    return json({ ok: true });
  });
}

async function signInAndPlay(page, base) {
  await page.goto(base + '/play.html', { waitUntil: 'load' });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
  await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('.hs-launchers'));
}

async function checks(overrides) {
  const fails = [];
  const { server, port } = await serve(overrides);
  const browser = await leaseBrowser(chromium);
  const open = async (sections) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const s = { env: Object.assign(clone(BASE_ENV), sections), version: 1, calls: [] };
    await stub(page, s);
    const up = await signInAndPlay(page, 'http://127.0.0.1:' + port);
    await page.keyboard.press('r');
    const opened = up && await wait(page, () => document.querySelector('[data-hs-win="services"] .hw-services'), null, 4000);
    return { ctx, page, errors, s, opened };
  };
  const sent = (s, n) => s.calls.filter((c) => c.name === n);
  const press = async (page, sel, rule) => { try { await page.click(sel, { timeout: 1500 }); return true; } catch { fails.push(rule + ' could not press ' + sel); return false; } };
  const txt = (page, sel) => page.evaluate((q) => { const e = document.querySelector('[data-hs-win="services"] ' + q); return e ? e.textContent : null; }, sel);
  const off = (page, sel) => page.evaluate((q) => { const e = document.querySelector('[data-hs-win="services"] ' + q); return e ? e.disabled : null; }, sel);
  try {
    {
      const { ctx, page, errors, s, opened } = await open(clone(SECTIONS));
      if (!opened) fails.push('SV-1 the Services window did not open from R');
      else {
        if (errors.length) fails.push('SV-1 console errors: ' + errors.join(' | ').slice(0, 300));
        // SV-2
        const quote = await txt(page, '.hw-stam-quote');
        if (!/Restores 4 h for 1,400/.test(quote || '') || !/Bought today: 1 of 6/.test(quote || '')) fails.push('SV-2 the quote line reads ' + JSON.stringify(quote));
        await press(page, '[data-hs-win="services"] [data-hs-act="stam-ask"]', 'SV-2');
        await page.waitForTimeout(150);
        if (sent(s, 'hr_stamina_refill').length) fails.push('SV-2 Buy sent a purchase before the confirmation');
        if (!/1,400/.test(await txt(page, '.hw-confirm-q') || '')) fails.push('SV-2 the confirmation does not state the price');
        await press(page, '[data-hs-win="services"] [data-hs-act="stam-yes"]', 'SV-2');
        await page.waitForTimeout(60);
        if (!(await off(page, '[data-hs-act="bless"][data-tier="2"]'))) fails.push('SV-2 a control stayed on while the purchase was in flight');
        await wait(page, () => !document.querySelector('[data-hs-win="services"] .hw-services.is-pending'), null, 4000);
        const st = sent(s, 'hr_stamina_refill');
        if (st.length !== 1 || st[0].body.p_price !== 1400) fails.push('SV-2 the confirm sent ' + JSON.stringify(st.map((c) => c.body)));
        // SV-3
        const rows = await page.evaluate(() => [...document.querySelectorAll('[data-hs-win="services"] .hw-bless li')].map((li) => ({ t: li.textContent, off: li.querySelector('button').disabled })));
        if (rows.length !== 3 || !/Owned/.test(rows[0].t) || !rows[0].off || rows[1].off || !/165/.test(rows[1].t) || !rows[2].off || !/Needs II/.test(rows[2].t)) {
          fails.push('SV-3 the tiers read ' + JSON.stringify(rows));
        }
        const note = await txt(page, '.hw-bless-note');
        if (!/Free below Level 30./.test(note || '') || !/uses them all up/.test(note || '')) fails.push('SV-3 the note reads ' + JSON.stringify(note));
        await press(page, '[data-hs-win="services"] [data-hs-act="bless"][data-tier="2"]', 'SV-3');
        await wait(page, () => !document.querySelector('[data-hs-win="services"] .hw-services.is-pending'), null, 4000);
        const bl = sent(s, 'hr_blessing_buy');
        if (bl.length !== 1 || bl[0].body.p_tier !== 2 || bl[0].body.p_price !== 165) fails.push('SV-3 the press sent ' + JSON.stringify(bl.map((c) => c.body)));
        // SV-4
        if (await page.evaluate(() => document.querySelectorAll('[data-hs-win="services"] input[type="text"]').length) !== 0) fails.push('SV-4 the Services window still offers a name box');
        if (sent(s, 'hr_character_name_set').length) fails.push('SV-4 the Services window sent a free name change');
      }
      await ctx.close();
    }
    { // SV-5
      const { ctx, page, opened } = await open({});
      if (!opened) fails.push('SV-5 the window did not open without the sections');
      else {
        if (!(await off(page, '[data-hs-act="stam-ask"]'))) fails.push('SV-5 Buy stamina is on with no quote');
        if (!/not priced/.test(await txt(page, '.hw-stam-quote') || '')) fails.push('SV-5 the stamina line does not say it is unpriced');
        if (await page.evaluate(() => document.querySelectorAll('[data-hs-win="services"] .hw-bless li').length) !== 0) fails.push('SV-5 blessing rows were invented');
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

const MUTANTS = [
  ['the confirm sends a price of its own', 'src/shell/windows/services.js', 'cs.buyStamina(q.price)', 'cs.buyStamina(q.price - 1)'],
  ['Buy sends without a confirmation', 'src/shell/windows/services.js',
    "if (q && q.available) { sc.confirm = true; sc.msg = ''; repaint(); } return true; }",
    "if (q && q.available) runIntent(sc, repaint, () => cs.buyStamina(q.price), 'x'); return true; }"],
  ['any missing tier can be bought', 'src/shell/windows/services.js', "prop(btn, 'disabled', t.held || !next || next.tier !== t.tier || sc.pending", "prop(btn, 'disabled', t.held || sc.pending"],
  ['the stamina control is on with no quote', 'src/shell/windows/services.js', 'const canStam = !!q && q.available && !sc.pending', 'const canStam = !sc.pending'],
  ['the reader invents a quote', 'src/session/item-sections.js', "  const q = read(cs, 'stamina_refill');\n", "  const q = read(cs, 'stamina_refill') || { available: true, n: 1, per_day: 6, price: 1, restore_ms: 60000 };\n"],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'services-window: ' + fails.length + ' rule(s) RED'
      : 'services-window: opens; stamina at the quoted price after a confirmation; blessings in order at their prices; no free name; fails safe');
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
  console.log(bad ? 'services-window --mutate: ' + bad + ' escaped' : 'services-window --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

main();
