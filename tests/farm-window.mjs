#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/farm-window.mjs — THE FARM WINDOW'S RULES, IN A REAL CHROMIUM (lane b-farm-window).
//
//   node tests/farm-window.mjs            the rules
//   node tests/farm-window.mjs --mutate   every planted defect must turn a rule RED
//
// mutant-anchors: src/shell/windows/farm.js src/session/farm-sections.js src/session/farm-intents.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs);
// the character is tests/fixtures/alpha-envelope.json plus a `farm_land` section
// (2026-11-26-farm-window.sql): room for 3 plots, plot 0 growing and waterable,
// plot 1 ready, plot 2 empty; 8 turnip seeds in the bag; Farming 1.
//   FW-1  Farm opens from its key (J) with zero console errors and draws exactly
//         the server's `cap` plots, each saying what grows in it
//   FW-2  PLANT: pressing the empty plot opens the seed picker; turnip says the
//         seeds held, carrot its Farming level; Plant sends exactly ONE
//         hr_farm_plant (slot, plot 2, turnip) and every control is off until
//         the server answers
//   FW-3  HARVEST ON THE SERVER'S WORD: only the ready plot shows Harvest (the
//         growing one does not, however its clock reads); Harvest sends ONE
//         hr_farm_harvest_replant for plot 1 and the line words the answer
//   FW-4  WATER: the waterable plot's Water sends ONE hr_farm_water for plot 0
//   FW-5  REFUSAL IN PLAIN WORDS: a refused plant (plot_cap) reads "no room"
//   FW-6  FAIL SAFE: with no farm_land section no plot is drawn and the window
//         says the field loads from the server
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';

const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const FARM = {
  farm_land: { cap: 3, plot_level: 1, deeds: 0, upgrade: { level: 2, gold: 500, deeds: 1, farming: 5 },
    plots: [{ i: 0, crop: 'turnip', ready: false, ready_in_s: 5400, waterable: true, regrows_left: null },
      { i: 1, crop: 'turnip', ready: true, ready_in_s: 0, waterable: false, regrows_left: null }] },
  inventory: Object.assign(clone(BASE_ENV.inventory), { turnip_seed: 8 }),
};
const HARVEST = { ok: true, plot: 1, crop: 'turnip', produce: 'turnip', qty: 3, xp: 1008, regrew: false, withered: false,
  replant: { ok: true, bought: 0, plot: 1, crop: 'turnip' } };
const RPCS = ['hr_farm_plant', 'hr_farm_water', 'hr_farm_harvest', 'hr_farm_harvest_replant', 'hr_farm_upgrade_plot'];
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
    if (RPCS.includes(name)) {
      await new Promise((ok) => setTimeout(ok, 400));
      return json(s.answers[name] || (name === 'hr_farm_harvest_replant' ? HARVEST : { ok: true }));
    }
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
  const W = '[data-hs-win="farm"] ';
  const open = async (sections, answers) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const s = { env: Object.assign(clone(BASE_ENV), sections), version: 1, calls: [], answers: answers || {} };
    await stub(page, s);
    const up = await signInAndPlay(page, 'http://127.0.0.1:' + port);
    await page.keyboard.press('j');
    const opened = up && await wait(page, () => document.querySelector('[data-hs-win="farm"] .hw-farm'), null, 4000);
    return { ctx, page, errors, s, opened };
  };
  const sent = (s, n) => s.calls.filter((c) => c.name === n);
  const press = async (page, sel, rule) => { try { await page.click(sel, { timeout: 1500 }); return true; } catch { fails.push(rule + ' could not press ' + sel); return false; } };
  const txt = (page, sel) => page.evaluate((q) => { const e = document.querySelector(q); return e ? e.textContent : null; }, sel);
  const idle = (page) => wait(page, () => !document.querySelector('[data-hs-win="farm"] .hw-farm.is-pending'), null, 4000);
  const shown = (page, sel) => page.evaluate((q) => { const e = document.querySelector(q); return !!e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'; }, sel);
  try {
    {
      const { ctx, page, errors, s, opened } = await open(clone(FARM));
      if (!opened) fails.push('FW-1 the Farm window did not open from J');
      else {
        if (errors.length) fails.push('FW-1 console errors: ' + errors.join(' | ').slice(0, 300));
        const plots = await page.evaluate(() => [...document.querySelectorAll('[data-hs-win="farm"] .hw-plot')].map((li) => li.querySelector('.hw-plot-say').textContent));
        if (plots.length !== 3 || !/^Turnip1 h 30 m left$/.test(plots[0]) || plots[1] !== 'TurnipReady' || plots[2] !== 'Empty') fails.push('FW-1 the field reads ' + JSON.stringify(plots));
        // FW-3 (before anything changes): Harvest only on the server's ready plot
        if (await shown(page, W + '.hw-plot[data-plot="0"] .hw-harvest')) fails.push('FW-3 the growing plot shows Harvest');
        if (!(await shown(page, W + '.hw-plot[data-plot="1"] .hw-harvest'))) fails.push('FW-3 the ready plot shows no Harvest');
        // FW-2
        await press(page, W + '.hw-plot[data-plot="2"] .hw-soil', 'FW-2');
        await wait(page, () => document.querySelector('[data-hs-win="farm"] .hw-sow.is-on'), null, 2000);
        const turnip = await txt(page, W + '.hw-seeds li[data-crop="turnip"] small');
        const carrot = await txt(page, W + '.hw-seeds li[data-crop="carrot"] small');
        if (!/8 seeds in your bag/.test(turnip || '') || !/Needs Farming 10/.test(carrot || '')) fails.push('FW-2 the picker reads turnip ' + JSON.stringify(turnip) + ', carrot ' + JSON.stringify(carrot));
        if (!(await page.evaluate(() => document.querySelector('[data-hs-win="farm"] .hw-seeds li[data-crop="carrot"] button').disabled))) fails.push('FW-2 carrot can be planted at Farming 1');
        await press(page, W + '.hw-seeds li[data-crop="turnip"] button', 'FW-2');
        await page.waitForTimeout(60);
        if (!(await page.evaluate(() => document.querySelector('[data-hs-win="farm"] [data-hs-act="water"]').disabled))) fails.push('FW-2 a control stayed on while the plant was in flight');
        await idle(page);
        const pl = sent(s, 'hr_farm_plant');
        if (pl.length !== 1 || pl[0].body.p_plot_idx !== 2 || pl[0].body.p_crop !== 'turnip' || pl[0].body.p_slot !== 0) fails.push('FW-2 Plant sent ' + JSON.stringify(pl.map((c) => c.body)));
        // FW-3
        await press(page, W + '.hw-plot[data-plot="1"] .hw-harvest', 'FW-3');
        await idle(page);
        const hv = sent(s, 'hr_farm_harvest_replant');
        if (hv.length !== 1 || hv[0].body.p_plot_idx !== 1 || sent(s, 'hr_farm_harvest').length) fails.push('FW-3 Harvest sent ' + JSON.stringify(s.calls.filter((c) => /harvest/.test(c.name))));
        const line = await txt(page, W + '.hh-intent-msg');
        if (!/Harvested 3 Turnip/.test(line || '') || !/Planted it again/.test(line || '')) fails.push('FW-3 the line reads ' + JSON.stringify(line));
        // FW-4
        await press(page, W + '.hw-plot[data-plot="0"] [data-hs-act="water"]', 'FW-4');
        await idle(page);
        const wt = sent(s, 'hr_farm_water');
        if (wt.length !== 1 || wt[0].body.p_plot_idx !== 0) fails.push('FW-4 Water sent ' + JSON.stringify(wt.map((c) => c.body)));
      }
      await ctx.close();
    }
    { // FW-5
      const { ctx, page, opened } = await open(clone(FARM), { hr_farm_plant: { ok: false, error: 'plot_cap', cap: 2 } });
      if (!opened) fails.push('FW-5 the window did not open');
      else {
        await press(page, W + '.hw-plot[data-plot="2"] .hw-soil', 'FW-5');
        await press(page, W + '.hw-seeds li[data-crop="turnip"] button', 'FW-5');
        await idle(page);
        const line = await txt(page, W + '.hh-intent-msg');
        if (!/no room/.test(line || '')) fails.push('FW-5 a refused plant reads ' + JSON.stringify(line));
      }
      await ctx.close();
    }
    { // FW-6
      const { ctx, page, opened } = await open({});
      if (!opened) fails.push('FW-6 the window did not open without the section');
      else {
        if (await page.evaluate(() => document.querySelectorAll('[data-hs-win="farm"] .hw-plot').length) !== 0) fails.push('FW-6 plots were invented');
        if (!(await shown(page, W + '.hw-farm-wait'))) fails.push('FW-6 the window does not say the field is loading');
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
  ['Harvest opens on the client clock, not the server', 'src/shell/windows/farm.js', "cls(harvest, 'is-on', !!p && p.ready);", "cls(harvest, 'is-on', !!p);"],
  ['Harvest leaves the plot empty', 'src/shell/windows/farm.js', "harvestPlot(ctx.account, cs, plot, action === 'harvest')", "harvestPlot(ctx.account, cs, plot, false)"],
  ['the picker ignores the Farming level', 'src/shell/windows/farm.js', "st.farming < c.req ? 'Needs Farming ' + c.req", "false ? 'Needs Farming ' + c.req"],
  ['the reader invents room', 'src/session/farm-sections.js', 'cap: Math.min(cap, MAX_PLOTS)', 'cap: Math.max(cap, 4)'],
  ['the reader invents a field', 'src/session/farm-sections.js', "  const raw = read(cs, 'farm_land');\n", "  const raw = read(cs, 'farm_land') || { cap: 2, plot_level: 1, plots: [] };\n"],
  ['plant names another plot', 'src/session/farm-intents.js', 'p_plot_idx: plot, p_crop: crop', 'p_plot_idx: plot + 1, p_crop: crop'],
  ['a refusal reads as a generic line', 'src/shell/windows/farm.js', "  plot_cap: 'Your land has no room for that plot yet.',\n", ''],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'farm-window: ' + fails.length + ' rule(s) RED'
      : 'farm-window: opens on J; the server\'s plots; plant from own seeds; harvest-and-replant only when the server says ready; water; refusals in plain words; fails safe');
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
  console.log(bad ? 'farm-window --mutate: ' + bad + ' escaped' : 'farm-window --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

main();
