#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/training-window.mjs — COMBAT TRAINING'S CLIENT HALF, IN A REAL CHROMIUM (lane/b-combat-training-client).
//
//   node tests/training-window.mjs                the rules
//   node tests/training-window.mjs --shots <dir>  also write the desktop and phone screenshots
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs); the hero is
// tests/fixtures/alpha-envelope.json ("Tyler", slot 0, 5,200 gold) moved to town. The `training` section and the two verbs
// answer in the shape src/session/training-sections.js reads (the designer's 2026-11-13 spec; the server half is
// lane/c-combat-training).
//   TR-1  NO SECTION, NOTHING SHOWS: no `training` section, no Training icon
//   TR-2  START (the happy path): the icon opens the window on the server's quote (fee, XP an hour, hours to the next level);
//         ONE hr_training_start names the slot, the skill, the place, the fee SEEN and a key, nothing else; the run then
//         shows from the re-read section, and Stop is the hunt's own Leave (hr_hunt_leave)
//   TR-3  SAY WHY BEFORE THE PRESS: out hunting, in a party, a purse under the first hour, the dummy in use: Start is off
//         with the words above it
//   TR-4  THE HOUSE DUMMY: the House shows the four skills, held and locked, and the server's next price; short of it,
//         Unlock is off with the words; with the gold, Unlock asks first, then ONE hr_house_dummy_unlock at the price seen
//   TR-5  SIZES: no text under 12 px, nothing off the screen, desktop 1440x900 and the 922x423 sheet
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';
import { pinFonts } from './_test-fonts.mjs';

const ARGS = process.argv.slice(2);
const SHOTS = ARGS.includes('--shots') ? ARGS[ARGS.indexOf('--shots') + 1] : null;
const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const iso = (ms) => new Date(ms).toISOString();
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

const QUOTES = [
  { skill: 'melee', level: 20, fee_h: 272, xp_h: 8100, hours_to_next: 5 },
  { skill: 'ranged', level: 5, fee_h: 80, xp_h: 900, hours_to_next: 1 },
  { skill: 'magic', level: 1, fee_h: 56, xp_h: 300, hours_to_next: 1 },
  { skill: 'defense', level: 19, fee_h: 164, xp_h: 4200, hours_to_next: 3 },
];
const DUMMY = (o) => Object.assign({ needs: 'homestead', has_home: true, owned: ['defense'], ladder: [150000, 250000, 400000, 600000], next_price: 250000, busy: null }, o);
const SECTION = (o) => Object.assign({ skills: ['melee', 'ranged', 'magic', 'defense'], max_hours: 12, quotes: QUOTES, run: null, last_stop: null, dummy: DUMMY({}) }, o);

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await pinFonts(page);
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load' || name === 'hr-accrue') return json(envOf(s));
    if (name === 'hr_training_start') {
      s.training = SECTION({ run: { skill: body.p_skill, where: body.p_where, since: iso(Date.now() - 65 * 60000), fee_h: body.p_fee_seen, paid: body.p_fee_seen * 2 } });
      return json({ ok: true });
    }
    if (name === 'hr_hunt_leave') { s.training = SECTION({ last_stop: { reason: 'left', skill: 'melee', at: iso(Date.now()) } }); return json({ ok: true, pending: false }); }
    if (name === 'hr_house_dummy_unlock') { s.training = SECTION({ dummy: DUMMY({ owned: ['defense', body.p_skill], next_price: 400000 }) }); return json({ ok: true }); }
    return json({ ok: true });
  });
}

function envOf(s) {
  const env = Object.assign(clone(BASE_ENV), { hunt: s.hunt || null, party: s.party || null, hunt_track: null, hunt_events: null, hunt_analyzer: null,
    now: iso(Date.now()), version: ++s.version, ok: true });
  env.state = Object.assign({}, env.state, { active_kind: s.hunt ? 'combat' : 'idle', active_id: s.hunt ? 'mill_cellar' : null, gold: s.gold });
  if (s.training) env.training = s.training;
  else delete env.training;
  return env;
}

const world = (o) => Object.assign({ calls: [], version: 1, gold: 5200, hunt: null, party: null, training: SECTION({}) }, o);

async function signInAndPlay(page, base) {
  await page.goto(base + '/play.html', { waitUntil: 'load', timeout: 60000 });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
  await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('.hs-launchers'));
}

async function checks() {
  const fails = [];
  const { server, port } = await serve();
  const base = 'http://127.0.0.1:' + port;
  const browser = await leaseBrowser(chromium);
  const open = async (s, viewport) => {
    const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/400|404/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await stub(page, s);
    if (!await signInAndPlay(page, base)) fails.push('harness: the page never reached the World');
    await page.waitForTimeout(300);
    return { ctx, page, errors };
  };
  const q = (page, sel) => page.evaluate((x) => { const e = document.querySelector('[data-hs-win="training"] ' + x); return e ? e.textContent : null; }, sel);
  const openTraining = async (page, phone) => {
    if (phone) {
      await page.keyboard.press('o');
      if (!await wait(page, () => { const b = document.querySelector('[data-hs-win="characters"] .hw-icon-names [data-hs-open="training"]'); return !!b && b.offsetParent !== null; }, null, 4000)) return false;
      await page.click('[data-hs-win="characters"] .hw-icon-names [data-hs-open="training"]');
    } else {
      try { await page.click('[data-hs-open="training"]', { timeout: 2000 }); } catch { return false; }
    }
    return wait(page, () => !!document.querySelector('[data-hs-win="training"] .tw-train'), null, 4000);
  };
  const offWhy = (page) => page.evaluate(() => { const b = document.querySelector('[data-hs-act="train-start"]'); return { off: !!b && b.disabled, why: (document.querySelector('[data-hs-win="training"] .tw-off-why') || {}).textContent || '' }; });

  try {
    /* TR-0: the server's refusal codes (2027-04-16-combat-training.sql) read with its numbers */
    {
      const { trainingRefusal } = await import('../src/shell/training-words.js');
      const want = [
        [{ verb: 'training_start', error: 'insufficient_gold', fee: 272, purse: 100 }, /costs 272 gold\. You have 100/],
        [{ verb: 'house_dummy', error: 'insufficient_gold', price: 250000, purse: 5200 }, /costs 250,000 gold\. You have 5,200/],
        [{ verb: 'training_start', error: 'hunt_open' }, /out hunting/],
        [{ verb: 'house_dummy', error: 'dummy_max' }, /Every skill is unlocked/],
      ];
      for (const [r, re] of want) { const w = trainingRefusal(r, 'Tyler'); if (!re.test(w || '')) fails.push('TR-0 ' + r.error + ' reads ' + JSON.stringify(w)); }
    }
    /* TR-1 */
    {
      const s = world({ training: null });
      const { ctx, page } = await open(s);
      if (await page.evaluate(() => !!document.querySelector('[data-hs-open="training"]'))) fails.push('TR-1 a Training icon shows with no `training` section');
      await ctx.close();
    }
    /* TR-2 */
    {
      const s = world({});
      const { ctx, page, errors } = await open(s);
      if (!await openTraining(page)) fails.push('TR-2 the icon did not open the Training window');
      else {
        const fee = await q(page, '.tw-fee'), xp = await q(page, '.tw-xp'), lvl = await q(page, '.tw-to-level');
        if (fee !== '272 gold an hour') fails.push('TR-2 the fee is not the server\'s quote: ' + JSON.stringify(fee));
        if (!/8,100 Melee XP/.test(xp || '')) fails.push('TR-2 the XP an hour is not the server\'s: ' + JSON.stringify(xp));
        if (!/5 hours to Melee 21/.test(lvl || '')) fails.push('TR-2 the hours to the next level are not the server\'s: ' + JSON.stringify(lvl));
        await page.click('[data-hs-act="train-start"]');
        await wait(page, () => { const r = document.querySelector('[data-hs-win="training"] .tw-run'); return !!r && !r.hidden; }, null, 4000);
        const starts = s.calls.filter((c) => c.name === 'hr_training_start');
        if (starts.length !== 1) fails.push('TR-2 hr_training_start sent ' + starts.length + ' times');
        else {
          const keys = Object.keys(starts[0].body).sort().join(',');
          if (keys !== 'p_fee_seen,p_idem,p_skill,p_slot,p_where') fails.push('TR-2 the start names more or less than slot, skill, place, fee seen and key: ' + keys);
          if (starts[0].body.p_skill !== 'melee' || starts[0].body.p_where !== 'yard' || starts[0].body.p_fee_seen !== 272) fails.push('TR-2 the start body: ' + JSON.stringify(starts[0].body));
        }
        const now = await q(page, '.tw-now'), clock = await q(page, '.tw-run-clock'), paid = await q(page, '.tw-run-paid');
        if (!/training Melee/.test(now || '')) fails.push('TR-2 the run does not show: ' + JSON.stringify(now));
        if (!/1 hour 5 minutes/.test(clock || '')) fails.push('TR-2 the clock is not the server\'s since: ' + JSON.stringify(clock));
        if (!/544 gold/.test(paid || '')) fails.push('TR-2 the paid line is not the server\'s: ' + JSON.stringify(paid));
        if (SHOTS) await page.screenshot({ path: join(SHOTS, 'training-desktop-run.png') });
        await page.click('[data-hs-act="train-stop"]');
        await wait(page, () => { const r = document.querySelector('[data-hs-win="training"] .tw-ended'); return !!r && !r.hidden; }, null, 4000);
        if (!s.calls.some((c) => c.name === 'hr_hunt_leave')) fails.push('TR-2 Stop did not send the hunt\'s Leave');
        if (!/You stopped/.test(await q(page, '.tw-ended') || '')) fails.push('TR-2 the window does not say why it ended');
      }
      if (errors.length) fails.push('TR-2 console: ' + errors.slice(0, 2).join(' | '));
      await ctx.close();
    }
    /* TR-3 */
    for (const [label, o, want, pick] of [
      ['hunting', { hunt: clone(BASE_ENV.hunt) }, /out hunting/, null],
      ['party', { party: clone(BASE_ENV.party) || { leader: 0, self: 0, members: [{ slot: 0, name: 'Tyler' }, { slot: 1, name: 'Mira' }] } }, /in a party/, null],
      ['short', { gold: 100 }, /The first hour costs 272 gold\. You have 100\./, null],
      ['busy', { training: SECTION({ dummy: DUMMY({ busy: 'Mira' }) }) }, /Mira is on your dummy/, 'defense'],
    ]) {
      const s = world(o);
      const { ctx, page } = await open(s);
      if (!await openTraining(page)) { fails.push('TR-3 ' + label + ': no window'); await ctx.close(); continue; }
      if (pick) { await page.click('[data-hs-act="skill"][data-skill="' + pick + '"]'); await page.click('[data-hs-act="where"][data-where="house"]'); await page.waitForTimeout(150); }
      const r = await offWhy(page);
      if (!r.off || !want.test(r.why)) fails.push('TR-3 ' + label + ': Start ' + (r.off ? 'off' : 'ON') + ' with ' + JSON.stringify(r.why));
      if (label === 'short' && SHOTS) await page.screenshot({ path: join(SHOTS, 'training-desktop-short.png') });
      await ctx.close();
    }
    /* TR-4 */
    {
      const s = world({ gold: 5200 });
      const { ctx, page } = await open(s);
      await page.keyboard.press('e');
      await wait(page, () => { const d = document.querySelector('[data-hs-win="house"] .hd-dummy'); return !!d && !d.hidden; }, null, 4000);
      const r = await page.evaluate(() => ({ held: [...document.querySelectorAll('.hd-skill.is-held b')].map((b) => b.textContent),
        offAll: [...document.querySelectorAll('[data-hs-act="dummy-ask"]')].filter((b) => !b.hidden).every((b) => b.disabled),
        why: (document.querySelector('.hd-why') || {}).textContent || '', next: (document.querySelector('.hd-next') || {}).textContent || '' }));
      if (r.held.join() !== 'Defense') fails.push('TR-4 the held skills are not the server\'s: ' + r.held.join());
      if (!/250,000/.test(r.next)) fails.push('TR-4 the next price is not the server\'s: ' + r.next);
      if (!r.offAll || !/costs 250,000 gold\. You have 5,200/.test(r.why)) fails.push('TR-4 short of the price, Unlock is not off with why: ' + JSON.stringify(r));
      await ctx.close();
      const s2 = world({ gold: 300000 });
      const o2 = await open(s2);
      await o2.page.keyboard.press('e');
      await wait(o2.page, () => { const d = document.querySelector('[data-hs-win="house"] .hd-dummy'); return !!d && !d.hidden; }, null, 4000);
      await o2.page.click('[data-hs-act="dummy-ask"][data-skill="melee"]');
      await wait(o2.page, () => { const c = document.querySelector('.hd-confirm'); return !!c && !c.hidden; }, null, 3000);
      if (s2.calls.some((c) => c.name === 'hr_house_dummy_unlock')) fails.push('TR-4 Unlock bought without asking first');
      await o2.page.locator('.hd-dummy').scrollIntoViewIfNeeded();
      if (SHOTS) await o2.page.screenshot({ path: join(SHOTS, 'house-dummy-desktop.png') });
      await o2.page.click('[data-hs-act="dummy-yes"]');
      await wait(o2.page, () => [...document.querySelectorAll('.hd-skill.is-held')].length === 2, null, 4000);
      const buys = s2.calls.filter((c) => c.name === 'hr_house_dummy_unlock');
      if (buys.length !== 1 || buys[0].body.p_skill !== 'melee' || buys[0].body.p_price !== 250000) fails.push('TR-4 the unlock: ' + JSON.stringify(buys.map((b) => b.body)));
      await o2.ctx.close();
    }
    /* TR-5 */
    for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 922, height: 423 }]]) {
      const s = world({});
      const { ctx, page } = await open(s, viewport);
      if (!await openTraining(page, label === 'phone')) { fails.push('TR-5 ' + label + ': no way to the Training window'); await ctx.close(); continue; }
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => {
        const win = document.querySelector('[data-hs-win="training"]');
        const small = [];
        for (const el of win.querySelectorAll('*')) {
          if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
          if (el.offsetParent === null) continue;
          if (parseFloat(getComputedStyle(el).fontSize) < 12) small.push(el.className);
        }
        const r = win.getBoundingClientRect();
        return { small, right: r.right, left: r.left, vw: innerWidth };
      });
      if (m.small.length) fails.push('TR-5 ' + label + ': text under 12 px: ' + m.small.slice(0, 4).join(', '));
      if (m.left < -1 || m.right > m.vw + 1) fails.push('TR-5 ' + label + ': the window runs off the screen');
      if (SHOTS) await page.screenshot({ path: join(SHOTS, 'training-' + label + '.png') });
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

async function main() {
  if (SHOTS) await mkdir(SHOTS, { recursive: true });
  const fails = await checks();
  for (const f of fails) console.log('FAIL  ' + f);
  console.log(fails.length ? 'training-window: ' + fails.length + ' FAILED' : 'training-window: green (nothing without the section, start, run, stop, say why, the house dummy, sizes)');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
