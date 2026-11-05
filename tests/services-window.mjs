#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/services-window.mjs — THE SHOP'S SERVICES TAB, IN A REAL CHROMIUM (lane S2; a tab of the Shop since 2026-10-25).
//
//   node tests/services-window.mjs            the rules
//   node tests/services-window.mjs --mutate   every planted defect must turn a rule RED
//
// mutant-anchors: src/shell/windows/services.js src/session/item-sections.js src/shell/windows/shop.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs);
// the character is tests/fixtures/alpha-envelope.json plus the two S2 sections.
//   SV-1  R opens the Shop on its Services tab (Tyler 2026-10-25: Services moved into the Shop) with zero console errors
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
//   SV-6  THE ANSWER STAYS: the tab's words ("Blessing II is yours.") survive the
//         Shop's next repaint (the Shop writes only its own line)
//   SV-7  TEMPERING AT THE SERVER'S PRICE: two rows for what this hero wears, in the server's numbers; a press only asks, at
//         that price, and the question is on screen; confirming sends ONE unlock_buy naming the offer and NO number; a row
//         at the top reads Full, a row short of gold says how short, gear with no ladder says so, and all of them are off
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';
import { pinFonts } from './_test-fonts.mjs';

const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const SECTIONS = {
  stamina_refill: { available: true, why: null, ms: 0, max_ms: 28800000, restore_ms: 14400000, price: 1400, n: 2, per_day: 6, level: 10 },
  blessings: { held: [1], permille: 320, free_until: 30, tiers: [
    { tier: 1, permille: 320, price: 110, held: true }, { tier: 2, permille: 630, price: 165, held: false },
    { tier: 3, permille: 950, price: 220, held: false }] },
};
const RPCS = ['hr_stamina_refill', 'hr_blessing_buy'];
/* Tempering, as hr_temper_view states it: Blows rung 1 at a price the fixture's 5,200 gp can pay, Armor at the top, and the next tier's ladders never begun. */
const TEMPER = { equipment: { weapon: 'iron_sword', helmet: 'iron_helm', body: 'iron_platebody', pants: 'iron_platelegs', boots: 'iron_boots' }, temper: [
  { track: 'armor', tier: 2, rung: 5, max: 5, offer: null, gold: null }, { track: 'armor', tier: 3, rung: 0, max: 5, offer: 'temper.armor.3.1', gold: 7000 },
  { track: 'blows', tier: 2, rung: 1, max: 5, offer: 'temper.blows.2.2', gold: 4000 }, { track: 'blows', tier: 3, rung: 0, max: 5, offer: 'temper.blows.3.1', gold: 7000 }] };
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await pinFonts(page);
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
    const opened = up && await wait(page, () => document.querySelector('[data-hs-win="shop"] [data-pane="services"] .hw-services'), null, 4000);
    return { ctx, page, errors, s, opened };
  };
  const sent = (s, n) => s.calls.filter((c) => c.name === n);
  const press = async (page, sel, rule) => { try { await page.click(sel, { timeout: 1500 }); return true; } catch { fails.push(rule + ' could not press ' + sel); return false; } };
  const txt = (page, sel) => page.evaluate((q) => { const e = document.querySelector('[data-hs-win="shop"] [data-pane="services"] ' + q); return e ? e.textContent : null; }, sel);
  const off = (page, sel) => page.evaluate((q) => { const e = document.querySelector('[data-hs-win="shop"] [data-pane="services"] ' + q); return e ? e.disabled : null; }, sel);
  try {
    {
      const { ctx, page, errors, s, opened } = await open(clone(SECTIONS));
      if (!opened) fails.push('SV-1 R did not open the Shop on its Services tab');
      else {
        if (errors.length) fails.push('SV-1 console errors: ' + errors.join(' | ').slice(0, 300));
        // SV-2
        const quote = await txt(page, '.hw-stam-quote');
        if (!/Restores 4 h for 1,400/.test(quote || '') || !/Bought today: 1 of 6/.test(quote || '')) fails.push('SV-2 the quote line reads ' + JSON.stringify(quote));
        await press(page, '[data-hs-win="shop"] [data-pane="services"] [data-hs-act="stam-ask"]', 'SV-2');
        await page.waitForTimeout(150);
        if (sent(s, 'hr_stamina_refill').length) fails.push('SV-2 Buy sent a purchase before the confirmation');
        if (!/1,400/.test(await txt(page, '.hw-confirm-q') || '')) fails.push('SV-2 the confirmation does not state the price');
        await press(page, '[data-hs-win="shop"] [data-pane="services"] [data-hs-act="stam-yes"]', 'SV-2');
        await page.waitForTimeout(60);
        if (!(await off(page, '[data-hs-act="bless"][data-tier="2"]'))) fails.push('SV-2 a control stayed on while the purchase was in flight');
        await wait(page, () => !document.querySelector('[data-hs-win="shop"] [data-pane="services"] .hw-services.is-pending'), null, 4000);
        const st = sent(s, 'hr_stamina_refill');
        if (st.length !== 1 || st[0].body.p_price !== 1400) fails.push('SV-2 the confirm sent ' + JSON.stringify(st.map((c) => c.body)));
        // SV-3
        const rows = await page.evaluate(() => [...document.querySelectorAll('[data-hs-win="shop"] [data-pane="services"] .hw-bless li')].map((li) => ({ t: li.textContent, off: li.querySelector('button').disabled })));
        if (rows.length !== 3 || !/Owned/.test(rows[0].t) || !rows[0].off || rows[1].off || !/165/.test(rows[1].t) || !rows[2].off || !/Needs II/.test(rows[2].t)) {
          fails.push('SV-3 the tiers read ' + JSON.stringify(rows));
        }
        const note = await txt(page, '.hw-bless-note');
        if (!/Free below Level 30./.test(note || '') || !/uses them all up/.test(note || '')) fails.push('SV-3 the note reads ' + JSON.stringify(note));
        await press(page, '[data-hs-win="shop"] [data-pane="services"] [data-hs-act="bless"][data-tier="2"]', 'SV-3');
        await wait(page, () => !document.querySelector('[data-hs-win="shop"] [data-pane="services"] .hw-services.is-pending'), null, 4000);
        const bl = sent(s, 'hr_blessing_buy');
        if (bl.length !== 1 || bl[0].body.p_tier !== 2 || bl[0].body.p_price !== 165) fails.push('SV-3 the press sent ' + JSON.stringify(bl.map((c) => c.body)));
        // SV-6: the tab's answer stays through the Shop's next repaint (a press on the shown tab repaints the Shop)
        await wait(page, () => /Blessing II is yours/.test(document.querySelector('[data-hs-win="shop"] [data-pane="services"] .hh-intent-msg').textContent), null, 3000);
        await press(page, '[data-hs-win="shop"] .hw-tab[data-tab="services"]', 'SV-6');
        await page.waitForTimeout(120);
        const kept = await txt(page, '.hh-intent-msg');
        if (!/Blessing II is yours/.test(kept || '')) fails.push('SV-6 the Shop\'s repaint wiped the Services answer: ' + JSON.stringify(kept));
        // SV-4
        if (await page.evaluate(() => document.querySelectorAll('[data-hs-win="shop"] [data-pane="services"] input[type="text"]').length) !== 0) fails.push('SV-4 the Services window still offers a name box');
        if (sent(s, 'hr_character_name_set').length) fails.push('SV-4 the Services window sent a free name change');
      }
      await ctx.close();
    }
    { // SV-7
      const { ctx, page, s, opened } = await open(Object.assign(clone(SECTIONS), clone(TEMPER)));
      const P = '[data-hs-win="shop"] [data-pane="services"] ';
      if (!opened) fails.push('SV-7 the Services tab did not open');
      else {
        const blows = await txt(page, '.hw-temper [data-track="blows"]'), armor = await txt(page, '.hw-temper [data-track="armor"]');
        if (!/Iron Sword/.test(blows || '') || !/Rung 1 of 5/.test(blows || '') || !/1% harder/.test(blows || '') || !/Next rung 2%/.test(blows || '')) fails.push('SV-7 the Blows row reads ' + JSON.stringify(blows));
        if (!/Rung 5 of 5/.test(armor || '') || !/5% softer/.test(armor || '') || !/Full/.test(armor || '')) fails.push('SV-7 the Armor row reads ' + JSON.stringify(armor));
        if (!(await off(page, '.hw-temper [data-track="armor"] button'))) fails.push('SV-7 a full ladder can still be pressed');
        const before = s.calls.length;
        const sales = () => s.calls.slice(before).filter((c) => c.name === 'hr-accrue' && JSON.stringify(c.body).includes('unlock_buy'));
        await press(page, P + '.hw-temper [data-track="blows"] button', 'SV-7');
        await page.waitForTimeout(150);
        if (sales().length) fails.push('SV-7 Temper sent a sale before the confirmation');
        if (!/rung 2 for 4,000/.test(await txt(page, '.hw-temper-ask .hw-confirm-q') || '')) fails.push('SV-7 the question does not state the rung and price: ' + await txt(page, '.hw-temper-ask .hw-confirm-q'));
        const seen = await page.evaluate((q) => { const e = document.querySelector(q); const r = e.getBoundingClientRect(); const w = e.closest('[data-hs-win]').getBoundingClientRect(); return r.height > 0 && r.top >= w.top && r.bottom <= w.bottom; }, P + '.hw-temper-ask');
        if (!seen) fails.push('SV-7 the question opened out of sight: the press looks dead');
        await press(page, P + '[data-hs-act="temper-yes"]', 'SV-7');
        await page.waitForTimeout(800);
        const buys = sales();
        if (buys.length !== 1) fails.push('SV-7 the confirm sent ' + buys.length + ' unlock_buy: ' + JSON.stringify(s.calls.slice(before).map((c) => c.name)));
        else {
          const raw = JSON.stringify(buys[0].body);
          if (!raw.includes('temper.blows.2.2')) fails.push('SV-7 the sale names another offer: ' + raw);
          if (/4000|"gold"|"price"/.test(raw)) fails.push('SV-7 a number crossed in the sale: ' + raw);
        }
      }
      await ctx.close();
    }
    { // SV-7: short of gold says how short, and the button is off
      const short = clone(TEMPER);
      short.temper = short.temper.map((l) => (l.track === 'blows' && l.tier === 2 ? { ...l, rung: 3, offer: 'temper.blows.2.4', gold: 16000 } : l));
      const { ctx, page, opened } = await open(Object.assign(clone(SECTIONS), short));
      if (!opened) fails.push('SV-7 the Services tab did not open short of gold');
      else {
        const b = await txt(page, '.hw-temper [data-track="blows"]');
        if (!/You need 10,800 gp more\./.test(b || '') || !(await off(page, '.hw-temper [data-track="blows"] button'))) fails.push('SV-7 short of gold reads ' + JSON.stringify(b));
      }
      await ctx.close();
    }
    { // SV-7: gear with no ladder says so, and nothing is on
      const { ctx, page, opened } = await open(Object.assign(clone(SECTIONS), { equipment: { weapon: 'bronze_sword', body: 'bronze_platebody' }, temper: clone(TEMPER.temper) }));
      if (!opened) fails.push('SV-7 the Services tab did not open on Bronze');
      else {
        const b = await txt(page, '.hw-temper [data-track="blows"]');
        if (!/can't be tempered\. Gear worn from Level 15 can\./.test(b || '') || !(await off(page, '.hw-temper [data-track="blows"] button'))) fails.push('SV-7 a Bronze Sword reads ' + JSON.stringify(b));
      }
      await ctx.close();
    }
    { // SV-5
      const { ctx, page, opened } = await open({});
      if (!opened) fails.push('SV-5 the Services tab did not open without the sections');
      else {
        if (!(await off(page, '[data-hs-act="stam-ask"]'))) fails.push('SV-5 Buy stamina is on with no quote');
        if (!/not priced/.test(await txt(page, '.hw-stam-quote') || '')) fails.push('SV-5 the stamina line does not say it is unpriced');
        if (await page.evaluate(() => document.querySelectorAll('[data-hs-win="shop"] [data-pane="services"] .hw-bless li').length) !== 0) fails.push('SV-5 blessing rows were invented');
        if (await page.evaluate(() => document.querySelectorAll('[data-hs-win="shop"] [data-pane="services"] .hw-temper li').length) !== 0) fails.push('SV-5 Tempering rows were invented');
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
  ['Temper sends without a confirmation (SV-7)', 'src/shell/windows/temper-pane.js', "sc.ask = t.getAttribute('data-track');\n    sc.msg = '';", "sc.ask = t.getAttribute('data-track');\n    return actTemperPane(ctx, 'temper-yes', t, sc, repaint);\n    sc.msg = '';"],
  ['the sale carries a price (SV-7)', 'src/shell/windows/temper-pane.js', "cs.edgeIntent('unlock_buy', { offer })", "cs.edgeIntent('unlock_buy', { offer, gold: 8000 })"],
  ['short of gold stays on (SV-7)', 'src/shell/windows/temper-pane.js', "prop(btn, 'disabled', !offer || !!short ||", "prop(btn, 'disabled', !offer ||"],
  ['the top of a ladder can be pressed (SV-7)', 'src/shell/windows/temper-pane.js', "prop(btn, 'disabled', !offer || !!short", "prop(btn, 'disabled', !!short"],
  ['the question opens out of sight (SV-7)', 'src/shell/windows/temper-pane.js', "    if (cf && cf.scrollIntoView) cf.scrollIntoView({ block: 'nearest' });\n", ''],
  ['the reader invents a ladder (SV-5)', 'src/session/temper-sections.js', "  if (!Array.isArray(s)) return null;\n", "  if (!Array.isArray(s)) return [{ track: 'blows', tier: 2, rung: 0, max: 5, offer: 'temper.blows.2.1', gold: 1 }];\n"],
  ['the confirm sends a price of its own', 'src/shell/windows/services.js', 'cs.buyStamina(q.price)', 'cs.buyStamina(q.price - 1)'],
  ['Buy sends without a confirmation', 'src/shell/windows/services.js',
    "if (q && q.available) { sc.confirm = true; sc.msg = ''; repaint(); } return true; }",
    "if (q && q.available) runIntent(sc, repaint, () => cs.buyStamina(q.price), 'x'); return true; }"],
  ['any missing tier can be bought', 'src/shell/windows/services.js', "prop(btn, 'disabled', t.held || !next || next.tier !== t.tier || sc.pending", "prop(btn, 'disabled', t.held || sc.pending"],
  ['the stamina control is on with no quote', 'src/shell/windows/services.js', 'const canStam = !!q && q.available && !sc.pending', 'const canStam = !sc.pending'],
  ['the Shop writes its own line over the Services answer (IP-3, v0.2.46)', 'src/shell/windows/shop.js',
    "text(root.querySelector(':scope > .hh-intent-msg'), st.sc.msgAt", "text(root.querySelector('.hh-intent-msg'), st.sc.msgAt"],
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
