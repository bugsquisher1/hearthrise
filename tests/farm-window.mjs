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
//   FW-7  ONE FIELD FOR EVERY HERO (2026-12-14-shared-farm.sql): the window says the
//         land is shared, each plot names the hero who planted it, an EXTRA plot
//         (past the cap) is drawn after the field saying it goes once harvested,
//         and its Harvest sends ONE plain hr_farm_harvest (never a replant) as the
//         hero on screen
//   FW-8  A CROP THAT REGROWS (report #66: "Harvest only" on a tomato grew it back): a
//         growing tomato says how often it grows back (the server's regrows_left); a ready
//         one offers "Harvest (grows back N more times)" (ONE hr_farm_harvest) and "Harvest
//         and clear plot" (ONE hr_farm_harvest_clear); on its last harvest it reads like
//         any crop (Harvest and replant / Harvest only)
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
    plots: [{ i: 0, crop: 'turnip', ready: false, ready_in_s: 5400, waterable: true, regrows_left: null, by: 0, by_name: 'Alda', extra: false },
      { i: 1, crop: 'turnip', ready: true, ready_in_s: 0, waterable: false, regrows_left: null, by: 1, by_name: 'Bren', extra: false }] },
  inventory: Object.assign(clone(BASE_ENV.inventory), { turnip_seed: 8 }),
};
/* The shared field: room for 2, plot 0 growing (Bren planted it), plot 1 empty, and an
   EXTRA plot 3 past the cap, ready (Alda planted it). */
const SHARED = {
  farm_land: { cap: 2, plot_level: 1, deeds: 0, upgrade: null,
    plots: [{ i: 0, crop: 'turnip', ready: false, ready_in_s: 600, waterable: false, regrows_left: null, by: 1, by_name: 'Bren', extra: false },
      { i: 3, crop: 'turnip', ready: true, ready_in_s: 0, waterable: false, regrows_left: null, by: 0, by_name: 'Alda', extra: true }] },
};
const EXTRA_HARVEST = { ok: true, plot: 3, crop: 'turnip', produce: 'turnip', qty: 2, xp: 672, regrew: false, withered: false, extra: true, planted_by: 0 };
const HARVEST = { ok: true, plot: 1, crop: 'turnip', produce: 'turnip', qty: 3, xp: 1008, regrew: false, withered: false,
  replant: { ok: true, bought: 0, plot: 1, crop: 'turnip' } };
/* Report #66: tomatoes REGROW. Room for 3: plot 0 growing (the server says 4 more regrows), plot 1
   ready (3 more), plot 2 ready on its LAST harvest (0 more: it withers, so it reads like any crop). */
const REGROW = {
  farm_land: { cap: 3, plot_level: 4, deeds: 0, upgrade: null,
    plots: [{ i: 0, crop: 'tomato', ready: false, ready_in_s: 3600, waterable: false, regrows_left: 4, by: 0, by_name: 'Alda', extra: false },
      { i: 1, crop: 'tomato', ready: true, ready_in_s: 0, waterable: false, regrows_left: 3, by: 0, by_name: 'Alda', extra: false },
      { i: 2, crop: 'tomato', ready: true, ready_in_s: 0, waterable: false, regrows_left: 0, by: 0, by_name: 'Alda', extra: false }] },
};
const CLEAR = { ok: true, plot: 1, crop: 'tomato', produce: 'tomato', qty: 3, xp: 4410, regrew: false, withered: false, extra: false, cleared: true, regrows_left: null };
const RPCS = ['hr_farm_plant', 'hr_farm_water', 'hr_farm_harvest', 'hr_farm_harvest_replant', 'hr_farm_harvest_clear', 'hr_farm_upgrade_plot'];
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
        /* Tyler 10-25: each label says what its verb does: Harvest and replant = hr_farm_harvest_replant (pressed below),
           Harvest only = hr_farm_harvest (the leave verb) */
        const labels = await page.evaluate(() => [...document.querySelectorAll('[data-hs-win="farm"] .hw-plot[data-plot="1"] button.hh-tool')].map((b) => [b.getAttribute('data-hs-act'), b.textContent]));
        if (JSON.stringify(labels) !== JSON.stringify([['harvest', 'Harvest and replant'], ['leave', 'Harvest only']])) fails.push('FW-3 the ready plot\'s buttons read ' + JSON.stringify(labels));
        // FW-2
        await press(page, W + '.hw-plot[data-plot="2"] .hw-soil', 'FW-2');
        await wait(page, () => document.querySelector('[data-hs-win="farm"] .hw-sow.is-on'), null, 2000);
        const turnip = await txt(page, W + '.hw-seeds li[data-crop="turnip"] small');
        const carrot = await txt(page, W + '.hw-seeds li[data-crop="carrot"] small');
        if (!/8 seeds in your bag/.test(turnip || '') || !/Needs Farming 10/.test(carrot || '')) fails.push('FW-2 the picker reads turnip ' + JSON.stringify(turnip) + ', carrot ' + JSON.stringify(carrot));
        if (!(await page.evaluate(() => document.querySelector('[data-hs-win="farm"] .hw-seeds li[data-crop="carrot"] button').disabled))) fails.push('FW-2 carrot can be planted at Farming 1');
        /* the tier line agrees with the picker (playtest 2026-10-29 #12): the soil needs Farming 5, the carrot itself 10 */
        const tier = await txt(page, W + '.hw-tier');
        if (!/Tier 2 adds Carrot \(Farming 10 to plant\): .*, at Farming 5\./.test(tier || '')) fails.push('FW-2 the tier line reads ' + JSON.stringify(tier) + ' beside "Needs Farming 10"');
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
    { // FW-7
      const { ctx, page, errors, s, opened } = await open(clone(SHARED), { hr_farm_harvest: EXTRA_HARVEST });
      if (!opened) fails.push('FW-7 the window did not open');
      else {
        if (errors.length) fails.push('FW-7 console errors: ' + errors.join(' | ').slice(0, 300));
        if (!(await shown(page, W + '.hw-farm-shared')) || !/^Your heroes share this land\./.test((await txt(page, W + '.hw-farm-shared')) || '')) fails.push('FW-7 the window does not say the land is shared: ' + JSON.stringify(await txt(page, W + '.hw-farm-shared')));
        const drawn = await page.evaluate(() => [...document.querySelectorAll('[data-hs-win="farm"] .hw-plot')].map((li) => li.getAttribute('data-plot')));
        if (drawn.join() !== '0,1,3') fails.push('FW-7 the field draws plots ' + JSON.stringify(drawn) + ', want 0,1 and the extra 3');
        const by0 = await txt(page, W + '.hw-plot[data-plot="0"] .hw-plot-by');
        if (by0 !== 'Planted by Bren') fails.push('FW-7 plot 0 says ' + JSON.stringify(by0) + ', want "Planted by Bren"');
        const by3 = await txt(page, W + '.hw-plot[data-plot="3"] .hw-plot-by');
        if (!/^Planted by Alda\. Extra plot: gone once harvested$/.test(by3 || '') || !(await page.evaluate(() => document.querySelector('[data-hs-win="farm"] .hw-plot[data-plot="3"]').classList.contains('is-extra')))) fails.push('FW-7 the extra plot says ' + JSON.stringify(by3));
        if (!/1 extra plot goes once harvested\./.test((await txt(page, W + '.hw-farm-land')) || '')) fails.push('FW-7 the land line reads ' + JSON.stringify(await txt(page, W + '.hw-farm-land')));
        const lone = await txt(page, W + '.hw-plot[data-plot="3"] .hw-harvest');
        if (lone !== 'Harvest') fails.push('FW-7 the extra plot\'s one button reads ' + JSON.stringify(lone) + ', want "Harvest" (it never replants)');
        await press(page, W + '.hw-plot[data-plot="3"] .hw-harvest', 'FW-7');
        await idle(page);
        const hv = s.calls.filter((c) => /harvest/.test(c.name));
        if (hv.length !== 1 || hv[0].name !== 'hr_farm_harvest' || hv[0].body.p_plot_idx !== 3 || hv[0].body.p_slot !== 0) fails.push('FW-7 the extra plot\'s Harvest sent ' + JSON.stringify(hv));
        const line = await txt(page, W + '.hh-intent-msg');
        if (!/Harvested 2 Turnip/.test(line || '') || !/That extra plot is gone now\./.test(line || '')) fails.push('FW-7 the line reads ' + JSON.stringify(line));
      }
      await ctx.close();
    }
    { // FW-8 (report #66)
      const { ctx, page, errors, s, opened } = await open(clone(REGROW), { hr_farm_harvest_clear: CLEAR,
        hr_farm_harvest: { ok: true, plot: 1, crop: 'tomato', produce: 'tomato', qty: 2, xp: 2940, regrew: true, withered: false, extra: false, regrows_left: 2 } });
      if (!opened) fails.push('FW-8 the window did not open');
      else {
        if (errors.length) fails.push('FW-8 console errors: ' + errors.join(' | ').slice(0, 300));
        const by0 = await txt(page, W + '.hw-plot[data-plot="0"] .hw-plot-by');
        if (by0 !== 'Planted by Alda. Grows back 4 more times after this harvest') fails.push('FW-8 the growing tomato says ' + JSON.stringify(by0));
        const labels = (i) => page.evaluate((n) => [...document.querySelectorAll('[data-hs-win="farm"] .hw-plot[data-plot="' + n + '"] button.hh-tool')].map((b) => [b.getAttribute('data-hs-act'), b.textContent]), i);
        const l1 = await labels(1);
        if (JSON.stringify(l1) !== JSON.stringify([['leave', 'Harvest (grows back 3 more times)'], ['clear', 'Harvest and clear plot']])) fails.push('FW-8 the ready tomato\'s buttons read ' + JSON.stringify(l1));
        const l2 = await labels(2);
        const by2 = await txt(page, W + '.hw-plot[data-plot="2"] .hw-plot-by');
        if (JSON.stringify(l2) !== JSON.stringify([['harvest', 'Harvest and replant'], ['leave', 'Harvest only']]) || !/Last harvest: the plant withers after it$/.test(by2 || '')) fails.push('FW-8 the last-harvest tomato reads ' + JSON.stringify([l2, by2]));
        await press(page, W + '.hw-plot[data-plot="1"] [data-hs-act="clear"]', 'FW-8');
        await idle(page);
        const cl = s.calls.filter((c) => /harvest/.test(c.name));
        if (cl.length !== 1 || cl[0].name !== 'hr_farm_harvest_clear' || cl[0].body.p_plot_idx !== 1 || cl[0].body.p_slot !== 0) fails.push('FW-8 Harvest and clear plot sent ' + JSON.stringify(cl));
        const line = await txt(page, W + '.hh-intent-msg');
        if (!/Harvested 3 Tomato/.test(line || '') || !/The plot is clear\./.test(line || '')) fails.push('FW-8 the line reads ' + JSON.stringify(line));
        await press(page, W + '.hw-plot[data-plot="1"] [data-hs-act="leave"]', 'FW-8');
        await idle(page);
        const hv = s.calls.filter((c) => /harvest/.test(c.name)).slice(1);
        if (hv.length !== 1 || hv[0].name !== 'hr_farm_harvest' || hv[0].body.p_plot_idx !== 1) fails.push('FW-8 Harvest (grows back) sent ' + JSON.stringify(hv));
        const line2 = await txt(page, W + '.hh-intent-msg');
        if (!/Harvested 2 Tomato .*It grows back, then 2 more times\.$/.test(line2 || '')) fails.push('FW-8 the regrow line reads ' + JSON.stringify(line2));
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
  ['the window never says the land is shared', 'src/shell/windows/farm.js', "    + '<p class=\"hs-note hw-farm-shared\">Your heroes share this land. The hero you are playing plants their own seeds and keeps the crop and the Farming XP.</p>'\n", ''],
  ['a plot never says who planted it', 'src/shell/windows/farm.js', "text(li.querySelector('.hw-plot-by'), !p ? '' :", "text(li.querySelector('.hw-plot-by'), true ? '' :"],
  ['an extra plot is not drawn', 'src/shell/windows/farm.js', '(_, i) => i).concat(extras);', '(_, i) => i);'],
  ['an extra plot is replanted', 'src/shell/windows/farm.js', "attr(harvest, 'data-hs-act', extra || vine ? 'leave' : 'harvest');", "attr(harvest, 'data-hs-act', vine ? 'leave' : 'harvest');"],
  ['the replant button reads plain Harvest (Tyler 10-25)', 'src/shell/windows/farm.js', "text(harvest, extra ? 'Harvest' : vine ?", "text(harvest, true ? 'Harvest' : vine ?"],
  ['the no-replant button reads Leave it empty (Tyler 10-25)', 'src/shell/windows/farm.js', "verb === 'leave' ? 'Harvest only' :", "verb === 'leave' ? 'Leave it empty' :"],
  ['the extra plot\'s button says replant (Tyler 10-25)', 'src/shell/windows/farm.js', "text(harvest, extra ? 'Harvest' : vine ?", "text(harvest, false ? 'Harvest' : vine ?"],
  /* Report #66: a regrowing crop (tomato) said "Harvest only" and grew back. */
  ['a regrowing crop offers Harvest only (#66)', 'src/shell/windows/farm.js', "const vine = regrow && more !== 0;", "const vine = false;"],
  ['a regrowing plot never says it grows back (#66)', 'src/shell/windows/farm.js', "    + (!regrow ? '' :", "    + (true ? '' :"],
  ['clear sends the plain harvest (#66)', 'src/session/farm-intents.js', "rpc('hr_farm_harvest_clear', {", "rpc('hr_farm_harvest', {"],
  ['the regrow count is not the server\'s (#66)', 'src/session/farm-sections.js', 'regrowsLeft: count(p.regrows_left)', 'regrowsLeft: 4'],
  ['the reader drops the planter', 'src/session/farm-sections.js', 'byName: nameOf(p.by_name)', 'byName: null'],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'farm-window: ' + fails.length + ' rule(s) RED'
      : 'farm-window: opens on J; the server\'s plots; plant from own seeds; harvest-and-replant only when the server says ready; water; refusals in plain words; fails safe; one field for every hero (who planted each plot, an extra plot harvested once); a regrowing crop says it grows back and can be harvested and cleared');
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
