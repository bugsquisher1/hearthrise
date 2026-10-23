#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/house-window.mjs — THE HOUSE WINDOW'S RULES, IN A REAL CHROMIUM.
//
//   node tests/house-window.mjs            the rules
//   node tests/house-window.mjs --mutate   every planted defect must turn a rule RED
//
// mutant-anchors: src/shell/windows/house.js src/session/home-sections.js src/session/home-intents.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs);
// the character is tests/fixtures/alpha-envelope.json (5,200 gold, 40 normal logs,
// 10 copper ore) plus the account's `home` and `depot` sections below.
//   HW-1  the House opens from its launcher key (E) with zero console errors and
//         names the account's home (the server's tier name) as shared
//   HW-2  THE DEED FROM THE SERVER: held tiers say so, the next tier lists what
//         it opens and its whole price against the bag, short lines marked, and
//         its Buy stays off while anything is short; later tiers have no price
//   HW-3  ROOMS: a built room says its rung and what it does now; a room the home
//         has not opened names the tier that opens it; a room whose rungs do
//         nothing offers no purchase
//   HW-4  A CHEST, PRICE FIRST: Build only opens the confirmation (nothing sent);
//         Pay sends exactly ONE hr_storage_chest_build naming the chest and the
//         QUOTED gold, every control off until the server answers
//   HW-5  A ROOM RUNG THROUGH THE ENGINE: Pay sends ONE hr-accrue unlock_buy with
//         the offer id and nothing that could be a price; the server's refusal
//         is said in plain words
//   HW-6  FAIL SAFE: with no home / depot sections nothing is offered and the
//         window says it is reading the house
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';

const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const SECTIONS = {
  home: { tier: 1, tiers: [
    { offer: 'property.homestead', name: 'Hearthside Homestead', tier: 1, gold: 400, items: { normal_log: 30 }, need: 0, owned: true },
    { offer: 'property.farmstead', name: 'Fieldworth Farmstead', tier: 2, gold: 2500, items: { oak_log: 40, copper_ore: 5 }, need: 1, owned: false },
    { offer: 'property.manor', name: 'Stonecross Manor', tier: 3, gold: 10000, items: { iron_ore: 40 }, need: 2, owned: false }],
  rooms: [
    { room: 'kitchen', name: 'Kitchen', level: 1, rungs: 5, opens: 1, rung_name: 'Hearthstone',
      next: { offer: 'room.kitchen.2', name: 'Iron Stove', rung: 2, gold: 2000, items: { normal_log: 20 }, need: 1, item: null } },
    { room: 'garden', name: 'Garden', level: 0, rungs: 5, opens: 1, rung_name: null,
      next: { offer: 'room.garden.1', name: 'Kitchen Garden', rung: 1, gold: 600, items: { normal_log: 5 }, need: 1, item: null } },
    { room: 'cellar', name: 'Cellar', level: 0, rungs: 5, opens: 2, rung_name: null,
      next: { offer: 'room.cellar.1', name: 'Root Cellar', rung: 1, gold: 1200, items: { normal_log: 60 }, need: 2, item: null } }] },
  depot: { used: 54, cap: 120, base: 100, tier: 1, chests: [
    { chest: 'millrace_crate', name: 'Millrace Crate', stacks: 20, tier: 0, gold: 1500, items: { normal_log: 40 }, built: true },
    { chest: 'thicketwood_chest', name: 'Thicketwood Chest', stacks: 30, tier: 1, gold: 3000, items: { normal_log: 10 }, built: false },
    { chest: 'ironbanded_strongbox', name: 'Ironbanded Strongbox', stacks: 50, tier: 2, gold: 25000, items: { iron_bar: 25 }, built: false }],
  next: { chest: 'thicketwood_chest', name: 'Thicketwood Chest', stacks: 30, tier: 1, gold: 3000, items: { normal_log: 10 }, can_build: true, why: null } },
};
const W = '[data-hs-win="house"] ';
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    const json = (b, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr-accrue' && body.verb === 'unlock_buy') {
      await new Promise((ok) => setTimeout(ok, 300));
      return json({ ok: false, verb: 'unlock_buy', error: 'prereq_property_tier', have: 1, need: 2 }, 409);
    }
    if (name === 'hr_load' || name === 'hr-accrue') return json(Object.assign(clone(s.env), { version: ++s.version, ok: true }));
    if (name === 'hr_storage_chest_build') { await new Promise((ok) => setTimeout(ok, 400)); return json({ ok: true }); }
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
    page.on('console', (m) => { if (m.type() === 'error' && !/409/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const s = { env: Object.assign(clone(BASE_ENV), sections), version: 1, calls: [] };
    await stub(page, s);
    const up = await signInAndPlay(page, 'http://127.0.0.1:' + port);
    await page.keyboard.press('e');
    const opened = up && await wait(page, () => document.querySelector('[data-hs-win="house"] .hw-house'), null, 4000);
    return { ctx, page, errors, s, opened };
  };
  const sent = (s, pred) => s.calls.filter(pred);
  const press = async (page, sel, rule) => { try { await page.click(sel, { timeout: 1500 }); return true; } catch { fails.push(rule + ' could not press ' + sel); return false; } };
  const txt = (page, sel) => page.evaluate((q) => { const e = document.querySelector(q); return e ? e.textContent : null; }, W + sel);
  const lines = (page, list) => page.evaluate((q) => [...document.querySelectorAll(q + ' > li')].map((li) => {
    const b = li.querySelector('button');
    return { t: li.textContent, short: [...li.querySelectorAll('.hw-mat.is-short')].map((m) => m.textContent), btn: b && b.classList.contains('is-on') ? (b.disabled ? 'off' : 'on') : 'none' };
  }), W + list);
  const idle = (page) => wait(page, () => !document.querySelector('[data-hs-win="house"] .hw-house.is-pending'), null, 4000);
  try {
    {
      const { ctx, page, errors, s, opened } = await open(clone(SECTIONS));
      if (!opened) fails.push('HW-1 the House window did not open from E');
      else {
        if (errors.length) fails.push('HW-1 console errors: ' + errors.join(' | ').slice(0, 300));
        const head = (await txt(page, '.hw-house-name')) + ' / ' + (await txt(page, '.hw-house-note'));
        if (!/Hearthside Homestead/.test(head) || !/all your characters/.test(head)) fails.push('HW-1 the head reads ' + JSON.stringify(head));
        // HW-2
        const deed = await lines(page, '.hw-deed');
        if (deed.length !== 3 || !/Yours/.test(deed[0].t) || deed[0].btn !== 'none'
          || !/Opens the Cellar/.test(deed[1].t) || !/2,500 gp/.test(deed[1].t) || deed[1].btn !== 'off' || !deed[1].short.some((m) => /Oak Log/i.test(m))
          || deed[1].short.some((m) => /Copper/i.test(m)) || /10,000/.test(deed[2].t) || deed[2].btn !== 'none' || !/After the Fieldworth Farmstead/.test(deed[2].t)) {
          fails.push('HW-2 the deed reads ' + JSON.stringify(deed));
        }
        // HW-3
        const rooms = await lines(page, '.hw-rooms');
        const by = (n) => rooms.find((r) => r.t.startsWith(n)) || { t: '', btn: '?' };
        if (!/Hearthstone, 1 of 5: cooking 2% faster/.test(by('Kitchen').t) || by('Kitchen').btn !== 'on' || !/2,000 gp/.test(by('Kitchen').t)) fails.push('HW-3 the Kitchen reads ' + JSON.stringify(by('Kitchen')));
        if (!/Opens with the Fieldworth Farmstead/.test(by('Cellar').t) || by('Cellar').btn !== 'none') fails.push('HW-3 the Cellar reads ' + JSON.stringify(by('Cellar')));
        // The Garden has a purpose (game-designer ruling 2026-10-22): its rung is offered and says what it builds,
        // on the ONE field the account's heroes share (Tyler 2026-10-23, 2026-12-14-shared-farm.sql).
        if (!/Not built yet\. Next: Kitchen Garden, 1 more farm bed on the land your heroes share/.test(by('Garden').t) || by('Garden').btn === 'none') fails.push('HW-3 the Garden reads ' + JSON.stringify(by('Garden')));
        // HW-4
        const chests = await lines(page, '.hw-chests');
        if (chests.length !== 3 || !/Built/.test(chests[0].t) || chests[0].btn !== 'none' || chests[1].btn !== 'on' || chests[2].btn !== 'none'
          || !/54 of 120 stacks used/.test(await txt(page, '.hw-chest-n') || '')) fails.push('HW-4 the chests read ' + JSON.stringify(chests));
        await press(page, W + '.hw-chests > li:nth-child(2) [data-hs-act="house-ask"]', 'HW-4');
        await page.waitForTimeout(150);
        if (sent(s, (c) => c.name === 'hr_storage_chest_build').length) fails.push('HW-4 Build sent before the confirmation');
        if (!/Thicketwood Chest/.test(await txt(page, '.hw-confirm-q') || '') || !/3,000 gp/.test(await txt(page, '.hw-confirm-note') || '')) fails.push('HW-4 the confirmation does not state the chest and its price');
        await press(page, W + '[data-hs-act="house-yes"]', 'HW-4');
        await page.waitForTimeout(60);
        if (!(await page.evaluate((q) => document.querySelector(q).disabled, W + '.hw-rooms > li:first-child button'))) fails.push('HW-4 a control stayed on while the build was in flight');
        await idle(page);
        const cb = sent(s, (c) => c.name === 'hr_storage_chest_build');
        if (cb.length !== 1 || cb[0].body.p_chest !== 'thicketwood_chest' || cb[0].body.p_price !== 3000 || cb[0].body.p_slot !== 0) fails.push('HW-4 Pay sent ' + JSON.stringify(cb.map((c) => c.body)));
        // HW-5
        await press(page, W + '.hw-rooms > li:first-child [data-hs-act="house-ask"]', 'HW-5');
        await press(page, W + '[data-hs-act="house-yes"]', 'HW-5');
        await idle(page);
        const ub = sent(s, (c) => c.name === 'hr-accrue' && c.body.verb === 'unlock_buy');
        if (ub.length !== 1 || ub[0].body.offer !== 'room.kitchen.2' || Object.keys(ub[0].body).some((k) => /price|gold|cost/i.test(k))) fails.push('HW-5 Pay sent ' + JSON.stringify(ub.map((c) => c.body)));
        if (!/too small/.test(await txt(page, '.hh-intent-msg') || '')) fails.push('HW-5 the refusal reads ' + JSON.stringify(await txt(page, '.hh-intent-msg')));
      }
      await ctx.close();
    }
    { // HW-6
      const { ctx, page, opened } = await open({});
      if (!opened) fails.push('HW-6 the window did not open without the sections');
      else {
        if (!/Reading your house/.test(await txt(page, '.hw-house-note') || '')) fails.push('HW-6 the head does not say it is reading the house');
        if (await page.evaluate((q) => document.querySelectorAll(q).length, W + '[data-hs-act="house-ask"]') !== 0) fails.push('HW-6 purchases were offered with no server sections');
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
  ['the chest is sent at a price of its own', 'src/shell/windows/house.js', 'buildChest(ctx.account, cs, ask.id, step.gold)', 'buildChest(ctx.account, cs, ask.id, step.gold - 1)'],
  ['Build sends without a confirmation', 'src/shell/windows/house.js',
    "if (id && (kind === 'home' || kind === 'chest')) { sc.ask = { kind, id }; sc.msg = ''; repaint(); }",
    "if (id && kind === 'chest') runIntent(sc, repaint, () => buildChest(ctx.account, cs, id, 3000), 'x');"],
  ['a short purse or bag still buys', 'src/shell/windows/house.js', "patchAsk(li.querySelector('button'), 'home', isNext ? t.offer : null, 'Buy', isNext && afford && !sc.pending);",
    "patchAsk(li.querySelector('button'), 'home', isNext ? t.offer : null, 'Buy', isNext && !sc.pending);"],
  ['a room the home has not opened is offered', 'src/shell/windows/house.js', 'const buyable = open && useful && n && !gated;', 'const buyable = useful && n;'],
  ['the reader invents a home', 'src/session/home-sections.js', "  const h = read(cs, 'home');\n", "  const h = read(cs, 'home') || { tier: 0, tiers: [{ offer: 'property.homestead', name: 'Home', tier: 1, need: 0, gold: 1, items: {} }], rooms: [] };\n"],
  ['the room rung goes to the wrong verb', 'src/session/home-intents.js', "cs.edgeIntent('unlock_buy', { offer })", "cs.edgeIntent('shop_buy', { offer, qty: 1 })"],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'house-window: ' + fails.length + ' rule(s) RED'
      : 'house-window: opens on E; the deed, rooms and chests from the server; a chest at its quoted price after a confirmation; a rung through unlock_buy; refusals in words; fails safe');
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
  console.log(bad ? 'house-window --mutate: ' + bad + ' escaped' : 'house-window --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

main();
