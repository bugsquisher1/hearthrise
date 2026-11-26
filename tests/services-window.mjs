#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/services-window.mjs — THE SHOP'S SERVICES TAB, IN A REAL CHROMIUM (lane S2; a tab of the Shop since 2026-10-25).
//
//   node tests/services-window.mjs            the rules
//   node tests/services-window.mjs --mutate   every planted defect must turn a NAMED rule RED (stopping at the first); a throw, a plant
//                                             that does not parse or a line with no SV id is HARNESS, never a catch (tests/_mutant-verdict.mjs)
//
// mutant-anchors: src/shell/windows/services.js src/session/item-sections.js src/shell/windows/shop.js src/shell/bless-all.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs);
// the character is tests/fixtures/alpha-envelope.json plus the two S2 sections.
//   SV-1  R opens the Shop on its Services tab (Tyler 2026-10-25: Services moved into the Shop) with zero console errors
//   SV-2  STAMINA, TOTAL FIRST: the server's quote (hours, price, today's count)
//         is shown; Buy only opens a confirmation (nothing sent); confirming sends
//         exactly ONE hr_time_buy (kind hunt) carrying the QUOTED price, and every
//         control is off until the server answers
//   SV-3  BLESSINGS IN ORDER: an owned tier reads Owned, only the next missing tier
//         can be bought (at its quoted price), a later one says what it needs; the
//         press is ONE hr_blessing_buy (tier, quoted price); "free until 30" and
//         "uses them all up" are said
//   SV-4  NO FREE NAME: the window has no name box and never sends
//         hr_character_name_set (Tyler 10-22: a new name costs gold; it is the
//         Characters window's Rename, tests/hero-rename-client.mjs)
//   SV-5  FAIL SAFE: with no time_blocks / blessings sections the purchase
//         controls stay off and the window says the server has not priced them
//   SV-6  THE ANSWER STAYS: the tab's words ("Blessing II is yours.") survive the
//         Shop's next repaint (the Shop writes only its own line)
//   SV-7 to SV-10 (the smith's old Tempering rungs, their material, the phone answer, where a salt's input drops) retired with the rungs
//         (lane/tp-im-steps, 2026-11-26): Temper on steps has its own verbs, and its tab is the client follow-up (HANDOFFS)
//   SV-11 BLESS ALL (designer re-read 2026-11-11: three presses to bless again after every death): one press sends one hr_blessing_buy per
//         missing tier, in order, each at the price the envelope its last purchase brought back quotes; no client total; the button goes
//         once nothing is missing
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';
import { pinFonts } from './_test-fonts.mjs';
import { judgePlanted, report, exitOf, cleanControl, stopAtFirstRed, FIRST_RED } from './_mutant-verdict.mjs';

const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const SECTIONS = {
  time_blocks: { hunt: { kind: 'hunt', available: true, why: null, ms: 0, max_ms: 36000000, ceiling_ms: 50400000, block_ms: 7200000, price: 1400, n: 2, bought: 1, per_day: 2, level: 10 } },
  blessings: { held: [1], permille: 320, free_until: 30, tiers: [
    { tier: 1, permille: 320, price: 110, held: true }, { tier: 2, permille: 630, price: 165, held: false },
    { tier: 3, permille: 950, price: 220, held: false }] },
};
const RPCS = ['hr_time_buy', 'hr_blessing_buy'];
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
    /* SV-11: the server holds the bought tier, and the next read says so (hr_blessing_view) */
    if (s.blessMoves && name === 'hr_blessing_buy') {
      const b = s.env.blessings, row = b.tiers.find((x) => x.tier === body.p_tier);
      if (row && row.price === body.p_price) { row.held = true; b.held = b.tiers.filter((x) => x.held).map((x) => x.tier); b.permille = row.permille; }
    }
    if (RPCS.includes(name)) { await new Promise((ok) => setTimeout(ok, 400)); return json({ ok: true }); }
    return json({ ok: true });
  });
}

async function signInAndPlay(page, base) {
  /* DOMContentLoaded with a long boot, as farm-window.mjs: `load` waits for every image, and on a loaded box the 6 s default timed out before the page drew */
  await page.goto(base + '/play.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
  await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('.hs-launchers'));
}

async function checks(overrides, { stopAtFirst = false } = {}) {
  const fails = [];
  if (stopAtFirst) stopAtFirstRed(fails);   // a mutant needs ONE red rule (tests/_mutant-verdict.mjs)
  const { server, port } = await serve(overrides);
  const browser = await leaseBrowser(chromium);
  const open = async (sections, phone) => {
    const ctx = await browser.newContext(phone ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } : { viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const s = { env: Object.assign(clone(BASE_ENV), sections), version: 1, calls: [], blessMoves: !!(sections && sections.blessMoves) };
    delete s.env.blessMoves;
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
        if (!/^\+2 h for 1,400/.test(quote || '') || !/Blocks today: 1 of 2/.test(quote || '')) fails.push('SV-2 the quote line reads ' + JSON.stringify(quote));
        /* the quote stands under its stamina line on the tab's 8 px rhythm (visual pass 2: a bare paragraph, the browser's 16 px above and below) */
        const gap = await page.evaluate(() => { const p = '[data-hs-win="shop"] [data-pane="services"] ', a = document.querySelector(p + '.hw-stam-now'), b = document.querySelector(p + '.hw-stam-quote');
          return a && b ? Math.round(b.getBoundingClientRect().top - a.getBoundingClientRect().bottom) : null; });
        if (gap === null || gap > 8) fails.push('SV-2 the quote stands ' + gap + ' px under the stamina line');
        await press(page, '[data-hs-win="shop"] [data-pane="services"] [data-hs-act="stam-ask"]', 'SV-2');
        await page.waitForTimeout(150);
        if (sent(s, 'hr_time_buy').length) fails.push('SV-2 Buy sent a purchase before the confirmation');
        if (!/1,400/.test(await txt(page, '.hw-confirm-q') || '')) fails.push('SV-2 the confirmation does not state the price');
        await press(page, '[data-hs-win="shop"] [data-pane="services"] [data-hs-act="stam-yes"]', 'SV-2');
        await page.waitForTimeout(60);
        if (!(await off(page, '[data-hs-act="bless"][data-tier="2"]'))) fails.push('SV-2 a control stayed on while the purchase was in flight');
        await wait(page, () => !document.querySelector('[data-hs-win="shop"] [data-pane="services"] .hw-services.is-pending'), null, 4000);
        const st = sent(s, 'hr_time_buy');
        if (st.length !== 1 || st[0].body.p_price !== 1400 || st[0].body.p_kind !== 'hunt') fails.push('SV-2 the confirm sent ' + JSON.stringify(st.map((c) => c.body)));
        // SV-3
        const rows = await page.evaluate(() => [...document.querySelectorAll('[data-hs-win="shop"] [data-pane="services"] .hw-bless li')].map((li) => ({ t: li.textContent, off: li.querySelector('button').disabled })));
        if (rows.length !== 3 || !/Owned/.test(rows[0].t) || !rows[0].off || rows[1].off || !/165/.test(rows[1].t) || !rows[2].off || !/Needs II/.test(rows[2].t)) {
          fails.push('SV-3 the tiers read ' + JSON.stringify(rows));
        }
        const note = await txt(page, '.hw-bless-note');
        if (note !== 'Each Blessing: −32% death XP loss · Used up on death · Free until Level 30') fails.push('SV-3 the note reads ' + JSON.stringify(note));
        await press(page, '[data-hs-win="shop"] [data-pane="services"] [data-hs-act="bless"][data-tier="2"]', 'SV-3');
        await wait(page, () => !document.querySelector('[data-hs-win="shop"] [data-pane="services"] .hw-services.is-pending'), null, 4000);
        const bl = sent(s, 'hr_blessing_buy');
        if (bl.length !== 1 || bl[0].body.p_tier !== 2 || bl[0].body.p_price !== 165) fails.push('SV-3 the press sent ' + JSON.stringify(bl.map((c) => c.body)));
        // SV-6: the tab's answer stays through the Shop's next repaint (a press on the shown tab repaints the Shop)
        await wait(page, () => /Blessing II is yours/.test(document.querySelector('[data-hs-win="shop"] [data-pane="services"] .hh-intent-msg').textContent), null, 3000);
        await press(page, '[data-hs-win="shop"] .hw-tab[data-tab="services"]', 'SV-6');
        await page.waitForTimeout(120);
        const kept = await txt(page, '.hh-intent-msg');
        if (!/Blessing II gained/.test(kept || '')) fails.push('SV-6 the Shop\'s repaint wiped the Services answer: ' + JSON.stringify(kept));
        // SV-4
        if (await page.evaluate(() => document.querySelectorAll('[data-hs-win="shop"] [data-pane="services"] input[type="text"]').length) !== 0) fails.push('SV-4 the Services window still offers a name box');
        if (sent(s, 'hr_character_name_set').length) fails.push('SV-4 the Services window sent a free name change');
      }
      await ctx.close();
    }
    { // SV-5
      /* SV-11 BLESS ALL (designer re-read 2026-11-11: three presses to bless again): ONE press buys every missing tier in order, each at the price
         the envelope the last purchase brought back quotes, and the button goes once nothing is missing */
      const sv = await open(Object.assign(clone(SECTIONS), { blessMoves: true }));
      if (!sv.opened) fails.push('SV-11 the Services tab did not open');
      else {
        const shown = () => sv.page.evaluate(() => { const b = document.querySelector('[data-hs-win="shop"] [data-pane="services"] [data-hs-act="bless-all"]'); return b ? { hidden: b.parentNode.hidden, off: b.disabled, t: b.textContent } : null; });
        const before = await shown();
        if (!before || before.hidden || before.off || before.t !== 'Bless all') fails.push('SV-11 Bless all with two missing reads ' + JSON.stringify(before));
        await press(sv.page, '[data-hs-win="shop"] [data-pane="services"] [data-hs-act="bless-all"]', 'SV-11');
        await wait(sv.page, () => /All 3 Blessings on/.test(document.querySelector('[data-hs-win="shop"] [data-pane="services"] .hh-intent-msg').textContent), null, 6000);
        const bought = sent(sv.s, 'hr_blessing_buy').map((c) => [c.body.p_tier, c.body.p_price]);
        if (JSON.stringify(bought) !== '[[2,165],[3,220]]') fails.push('SV-11 Bless all sent ' + JSON.stringify(bought));
        const msg = await txt(sv.page, '.hh-intent-msg'), after = await shown();
        if (!/All 3 Blessings on/.test(msg || '') || !after || !after.hidden) fails.push('SV-11 after Bless all: ' + JSON.stringify({ msg, after }));
        /* say-why: with nothing left to buy, the line under it says so */
        const why = await txt(sv.page, '.hw-bless-all-why');
        if (why !== 'All Blessings on') fails.push('SV-11 the Bless all why line reads ' + JSON.stringify(why));
        if (sv.errors.length) fails.push('SV-11 console errors: ' + sv.errors.join(' | ').slice(0, 300));
      }
      await sv.ctx.close();
    }
    {
      const { ctx, page, opened } = await open({});
      if (!opened) fails.push('SV-5 the Services tab did not open without the sections');
      else {
        if (!(await off(page, '[data-hs-act="stam-ask"]'))) fails.push('SV-5 Buy stamina is on with no quote');
        if ((await txt(page, '.hw-stam-quote')) !== 'No block price yet') fails.push('SV-5 the stamina line does not say it is unpriced');
        if (await page.evaluate(() => document.querySelectorAll('[data-hs-win="shop"] [data-pane="services"] .hw-bless li').length) !== 0) fails.push('SV-5 blessing rows were invented');
      }
      await ctx.close();
    }
  } catch (e) { if (e !== FIRST_RED) throw e; } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

const MUTANTS = [
  ['the confirm sends a price of its own', 'src/shell/windows/services.js', "cs.buyTime('hunt', q.price)", "cs.buyTime('hunt', q.price - 1)"],
  ['Buy sends without a confirmation', 'src/shell/windows/services.js',
    "if (q && q.available) { sc.confirm = true; sc.msg = ''; repaint(); } return true; }",
    "if (q && q.available) runIntent(sc, repaint, () => cs.buyTime('hunt', q.price), 'x'); return true; }"],
  ['any missing tier can be bought', 'src/shell/windows/services.js', "prop(btn, 'disabled', r.held || !next || next.tier !== r.tier || sc.pending", "prop(btn, 'disabled', r.held || sc.pending"],
  ['Bless all buys one tier (SV-11)', 'src/shell/bless-all.js', '    r = got;\n', '    return got;\n'],
  ['the stamina control is on with no quote', 'src/shell/windows/services.js', 'const canStam = !!q && q.available && !sc.pending', 'const canStam = !sc.pending'],
  ['the Shop writes its own line over the Services answer (IP-3, v0.2.46)', 'src/shell/windows/shop.js',
    "text(root.querySelector(':scope > .hh-intent-msg'), st.sc.msgAt", "text(root.querySelector('.hh-intent-msg'), st.sc.msgAt"],
  ['the reader invents a quote', 'src/session/item-sections.js', '  const q = isObj(all) ? all.hunt : null;\n', "  const q = isObj(all) ? all.hunt : { available: true, bought: 0, per_day: 2, price: 1, block_ms: 60000 };\n"],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'services-window: ' + fails.length + ' rule(s) RED'
      : 'services-window: opens; stamina at the quoted price after a confirmation; blessings in order at their prices; no free name; fails safe');
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await cleanControl(() => checks(null));
  console.log(clean.line);
  if (clean.code) process.exit(clean.code);
  /* A mutant is caught only by a NAMED rule (SV-n); a plant that does not parse, a step that throws, or a line with no rule id is
     HARNESS, never a catch (tests/_mutant-verdict.mjs; lane/c-hollow-proofs-browser 2026-11-20: this loop scored ANY fail line). */
  const counts = { caught: 0, harness: 0, escaped: 0 };
  for (const [name, file, from, to] of MUTANTS) {
    const text = (await readFile(join(ROOT, file), 'utf8')).replace(/\r\n/g, '\n');
    if (!text.includes(from)) { console.log('  ✗ ' + name + ' — HARNESS: anchor not found in ' + file); counts.harness++; continue; }
    const plant = { [file]: text.replace(from, to) };
    console.log(report(name, await judgePlanted(plant, () => checks(plant, { stopAtFirst: true })), counts));
  }
  console.log(exitOf(counts) ? 'services-window --mutate: ' + counts.escaped + ' escaped, ' + counts.harness + ' HARNESS (not catches)'
    : 'services-window --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught, each by a named rule');
  process.exit(exitOf(counts));
}

main();
