#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/boss-call-window.mjs — CALL OUT ON THE GROUND'S PAGE, IN A REAL CHROMIUM (src/shell/windows/boss-call-pane.js; the money line is tests/boss-call.mjs, the server tests/boss-call-db.mjs).
//
//   node tests/boss-call-window.mjs            the rules
//   node tests/boss-call-window.mjs --mutate   every planted defect must turn a rule RED
//
// mutant-anchors: src/shell/windows/boss-call-pane.js src/session/boss-intents.js src/shell/windows/hunts.js src/hunt-view/summary-model.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs).
//   BW-1  THE SERVER'S WORDS: alone, the page says why and the press is off; a member reads the leader's line; a ground with no boss to call shows nothing
//   BW-2  THE WARNING, THEN ONE PRESS: the press only opens the warning, at the server's price (nothing sent); Not yet closes it; confirming sends ONE hr_boss_call with the id and the QUOTED price
//   BW-3  A MOVED PRICE: quote_changed shows the server's new price and the words say nothing was charged; the next press carries the new price
//   BW-4  NO ANSWER, NO PRESS, NO HAMMER: a server that won't quote leaves the press off and is not asked again on the repaint its own answer causes
//   BW-5  NO FREE WAY BACK: Hunt again has nothing to send from a called room, and says why; a normal hunt's still does; both ends have their words
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';
import { pinFonts } from './_test-fonts.mjs';

const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const PID = '00000000-0000-4000-8000-00000000bc01';
const seat = (seatNo, name) => ({ seat: seatNo, name, level: 25, slot: 0, hunting: false, weapon: 'iron_sword', role: 'tank' });
const PARTY = (self, leader = 0) => ({ party: { id: PID, max: 4, hunt: null, open: false, self_seat: self, leader_seat: leader, members: [seat(0, 'Marlow'), seat(1, 'Tessaly')] } });
const QUOTE = (o) => Object.assign({ call: 'rat_king', available: true, why: null, price: 10000, used: 1, per_day: 3, left: 2, seats: 2, party_min: 2 }, o);
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
    if (name === 'hr_boss_call_view') return s.view === null ? json({ ok: false, error: 'rate_limited' }) : json({ ok: true, quote: s.view });
    if (name === 'hr_boss_call') return json(s.answer ? s.answer(body) : { ok: true, boss_call: s.view });
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
  /* The Hunts window on `hunt`'s page, for a hero with these sections and this quote. */
  const open = async (sections, view, answer, hunt = 'millrace_sewer') => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/400|404/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    /* the fixture's hero hunts, in a party: this one stands in town, alone unless `sections` seat it */
    const env = Object.assign(clone(BASE_ENV), { hunt: null, party: null, hunt_track: null, hunt_events: null, hunt_analyzer: null }, sections);
    env.state = Object.assign({}, env.state, { active_kind: 'idle', active_id: null });
    const s = { env, version: 1, calls: [], view, answer };
    await stub(page, s);
    await signInAndPlay(page, 'http://127.0.0.1:' + port);
    await page.click('[data-hs-open="hunts"]');
    await page.click('.hw-hunt[data-hunt="' + hunt + '"]');
    await page.waitForTimeout(600);
    return { ctx, page, errors, s };
  };
  const sent = (s, n) => s.calls.filter((c) => c.name === n);
  const txt = (page, sel) => page.evaluate((q) => { const e = document.querySelector('.hw-hd-call ' + q); return e ? e.textContent : null; }, sel);
  const shown = (page, sel) => page.evaluate((q) => { const e = document.querySelector(q); return !!e && e.offsetParent !== null; }, sel);
  const press = async (page, sel, rule) => { try { await page.click(sel, { timeout: 1500 }); return true; } catch { fails.push(rule + ' could not press ' + sel); return false; } };
  const off = (page) => page.evaluate(() => { const b = document.querySelector('.hw-call-press'); return b ? b.disabled : null; });
  try {
    /* BW-1 */
    {
      const { ctx, page, errors, s } = await open({}, QUOTE({ available: false, why: 'call_party', seats: 1 }));
      if (!/The Rat King wants a party of two or more\./.test(await txt(page, '.hw-call-line') || '')) fails.push('BW-1 alone reads ' + JSON.stringify(await txt(page, '.hw-call-line')));
      if (await off(page) !== true) fails.push('BW-1 alone, the press is not off');
      if (!/Call out the Rat King: 10,000 gp/.test(await txt(page, '.hw-call-press') || '')) fails.push('BW-1 the press reads ' + JSON.stringify(await txt(page, '.hw-call-press')));
      await page.click('.hw-hunt[data-hunt="mill_cellar"]');
      await page.waitForTimeout(200);
      if (await shown(page, '.hw-hd-call')) fails.push('BW-1 a ground with no boss to call shows the section');
      if (errors.length) fails.push('BW-1 console errors: ' + errors.join(' | ').slice(0, 300));
      if (sent(s, 'hr_boss_call').length) fails.push('BW-1 something was charged');
      await ctx.close();
    }
    {
      const { ctx, page } = await open(PARTY(1), QUOTE({ available: false, why: 'call_leader' }));
      if (!/Only your party's leader can call him out\./.test(await txt(page, '.hw-call-line') || '')) fails.push('BW-1 a member reads ' + JSON.stringify(await txt(page, '.hw-call-line')));
      if (await off(page) !== true) fails.push('BW-1 a member\'s press is not off');
      await ctx.close();
    }
    /* BW-2 */
    {
      const { ctx, page, s, errors } = await open(PARTY(0), QUOTE({}));
      if (!/2 calls left today\./.test(await txt(page, '.hw-call-line') || '')) fails.push('BW-2 the page reads ' + JSON.stringify(await txt(page, '.hw-call-line')));
      if (await off(page) !== false) fails.push('BW-2 the leader\'s press is off');
      await press(page, '[data-hs-act="call-warn"]', 'BW-2');
      await page.waitForTimeout(150);
      if (sent(s, 'hr_boss_call').length) fails.push('BW-2 the first press charged');
      if (!await shown(page, '.hw-call-warn')) fails.push('BW-2 no warning');
      const warned = await txt(page, '.hw-call-warn') || '';
      if (!/a death ends the fight/.test(warned) || !/10,000 gp from your purse, win or lose/.test(warned) || !/no XP, no coin and no drops/.test(warned)) fails.push('BW-2 the warning reads ' + JSON.stringify(warned));
      await press(page, '[data-hs-act="call-no"]', 'BW-2');
      await page.waitForTimeout(150);
      if (await shown(page, '.hw-call-warn')) fails.push('BW-2 Not yet left the warning up');
      await press(page, '[data-hs-act="call-warn"]', 'BW-2');
      await press(page, '[data-hs-act="call-go"]', 'BW-2');
      await page.waitForTimeout(500);
      const calls = sent(s, 'hr_boss_call');
      if (calls.length !== 1) fails.push('BW-2 ' + calls.length + ' calls went out');
      else if (calls[0].body.p_call !== 'rat_king' || calls[0].body.p_price !== 10000 || calls[0].body.p_slot !== 0 || !calls[0].body.p_idem || Object.keys(calls[0].body).length !== 4) fails.push('BW-2 the press sent ' + JSON.stringify(calls[0].body));
      if (errors.length) fails.push('BW-2 console errors: ' + errors.join(' | ').slice(0, 300));
      await ctx.close();
    }
    /* BW-3 */
    {
      const moved = QUOTE({ price: 12000 });
      const { ctx, page, s } = await open(PARTY(0), QUOTE({}), (b) => (b.p_price === 12000 ? { ok: true, boss_call: moved } : { ok: false, error: 'quote_changed', boss_call: moved }));
      await press(page, '[data-hs-act="call-warn"]', 'BW-3');
      await press(page, '[data-hs-act="call-go"]', 'BW-3');
      await page.waitForTimeout(500);
      const msg = await page.evaluate(() => (document.querySelector('.hw-hunts .hh-intent-msg') || {}).textContent || '');
      if (!/weren't charged/.test(msg)) fails.push('BW-3 the answer reads ' + JSON.stringify(msg));
      if (!/12,000 gp/.test(await txt(page, '.hw-call-press') || '')) fails.push('BW-3 the press still reads ' + JSON.stringify(await txt(page, '.hw-call-press')));
      await press(page, '[data-hs-act="call-warn"]', 'BW-3');
      await press(page, '[data-hs-act="call-go"]', 'BW-3');
      await page.waitForTimeout(500);
      const calls = sent(s, 'hr_boss_call');
      if (calls.length !== 2 || calls[1].body.p_price !== 12000) fails.push('BW-3 the second press sent ' + JSON.stringify(calls.map((c) => c.body.p_price)));
      await ctx.close();
    }
    /* BW-4 */
    {
      const { ctx, page, s } = await open(PARTY(0), null);
      await page.waitForTimeout(1500);
      if (await off(page) !== true) fails.push('BW-4 with no quote the press is on');
      if (sent(s, 'hr_boss_call_view').length > 1) fails.push('BW-4 asked ' + sent(s, 'hr_boss_call_view').length + ' times in a moment');
      await ctx.close();
    }
    /* BW-5: the module as this page serves it (a mutant's text included). */
    {
      const { ctx, page } = await open({}, QUOTE({ available: false, why: 'call_party' }));
      const r = await page.evaluate(async () => {
        const v = new URL(Array.from(document.querySelectorAll('link[rel="modulepreload"]'), (l) => l.href).find((h) => h.includes('/summary-model.js'))).search;
        const M = await import('/src/hunt-view/summary-model.js' + v);
        return { room: M.huntAgainOf({ hunt: 'millrace_sewer_called', preset: 0, hoursLimit: null, bag: [] }), ground: M.huntAgainOf({ hunt: 'millrace_sewer', preset: 0, hoursLimit: null, bag: [] }),
          felled: M.endWords('boss_felled'), time: M.endWords('boss_time') };
      });
      if (r.room !== null) fails.push('BW-5 Hunt again has something to send from a called room');
      if (!r.ground) fails.push('BW-5 Hunt again is gone from a normal hunt');
      if (r.felled === 'The hunt ended.' || r.time === 'The hunt ended.') fails.push('BW-5 an end has no words: ' + JSON.stringify(r));
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

const MUTANTS = [
  { name: 'the first press charges', file: 'src/shell/windows/boss-call-pane.js', from: "if (action === 'call-warn') { sc.warned = true; repaint(); return true; }", to: "if (action === 'call-warn') { run(() => callOut(ctx.account, cs, sc.call.id, sc.quote.price), '', () => ''); return true; }", want: /BW-2/ },
  { name: 'the press sends the data\'s fee, not the server\'s', file: 'src/shell/windows/boss-call-pane.js', from: 'run(() => callOut(ctx.account, cs, call.id, quote.price),', to: 'run(() => callOut(ctx.account, cs, call.id, call.fee),', want: /BW-3/ },
  { name: 'the press is on with no quote', file: 'src/shell/windows/boss-call-pane.js', from: 'const open = !!q && q.available && !v.now && !v.pending;', to: 'const open = !v.now && !v.pending;', want: /BW-1|BW-4/ },
  { name: 'a moved price is not read back', file: 'src/shell/windows/boss-call-pane.js', from: '.then((r) => { if (r && r.quote) sc.quote = r.quote; else sc.at = 0; repaint(); });', to: '.then(() => { repaint(); });', want: /BW-3/ },
  { name: 'every repaint asks again', file: 'src/shell/windows/boss-call-pane.js', from: 'if (!sc.asking && !v.now && now - sc.at > QUOTE_STANDS_MS) {', to: 'if (!sc.asking && !v.now && (!sc.quote || now - sc.at > QUOTE_STANDS_MS)) {', want: /BW-4/ },
  { name: 'a free way back from the room', file: 'src/hunt-view/summary-model.js', from: ' || callOfHunt(summary.hunt)) return null;', to: ') return null;', want: /BW-5/ },
];

async function main() {
  if (process.argv.includes('--mutate') || process.argv.includes('--selftest')) {
    if (process.env.HR_MUTANT_CONTROL) { const f = await checks(); console.log('boss-call-window --mutate: control ran the clean tree: ' + (f.join('; ') || 'green')); process.exit(0); }
    let escaped = 0;
    for (const m of MUTANTS) {
      const src = (await readFile(join(ROOT, m.file), 'utf8'));
      if (src.split(m.from).length !== 2) throw new Error('anchor: ' + m.name);
      let got;
      try { got = await checks({ [m.file]: src.replace(m.from, () => m.to) }); } catch (e) { got = ['THREW ' + String(e && e.message).slice(0, 160)]; }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + String(got[0] || 'every rule held').slice(0, 130));
    }
    console.log(escaped ? `boss-call-window --mutate: ${escaped} ESCAPED` : `boss-call-window --mutate: ${MUTANTS.length}/${MUTANTS.length} caught`);
    process.exit(escaped ? 1 : 0);
  }
  const fails = await checks();
  for (const f of fails) console.log('FAIL  ' + f);
  console.log(fails.length ? 'boss-call-window: ' + fails.length + ' FAILED' : 'boss-call-window: green (the server\'s words, the warning, one press, a moved price, no hammer, no free way back)');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
