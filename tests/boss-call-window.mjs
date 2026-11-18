#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/boss-call-window.mjs — CALL OUT ON THE GROUND'S PAGE, IN A REAL CHROMIUM (src/shell/windows/boss-call-pane.js; the money line is tests/boss-call.mjs, the server tests/boss-call-db.mjs).
//
//   node tests/boss-call-window.mjs            the rules
//   node tests/boss-call-window.mjs --mutate   every planted defect must turn a rule RED
//
// mutant-anchors: src/shell/windows/boss-call-pane.js src/session/boss-quote.js src/hunt-view/summary-model.js src/hunt-view/boss-loss.js src/shell/widgets/boss-bar.js src/shell/windows/hunts.js src/data/boss-calls.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs).
//   BW-1  THE SERVER'S WORDS: alone, the press is on, the line says what a fight costs (the quote's stamina and gold) and the warning carries one more line (a
//         warning, never a lock: the designer's ruling 2, 2026-11-10); one confirm calls ONE fight and the answer names no party; a member reads the leader's
//         line; a seat that can't pay is named; a ground with no boss to call shows nothing
//   BW-2  THE SLIDER, THEN ONE PRESS (Tyler 2026-11-14): the press only opens the warning (nothing sent); the slider runs 1 to the SERVER'S top and answers as
//         it moves; every number beside it is the quote's (one fight's stamina, gold and limit, what the room covers), and the total is the quote's own entry
//         for the picked count, never a sum made in the browser; Not yet closes it; confirming sends ONE hr_boss_call with the id, the picked count and the QUOTED price
//   BW-3  A MOVED PRICE: quote_changed shows the server's new price and the words say nothing was charged; the next press carries the new price and the same count
//   BW-11 NATURAL WINS BEFORE THE CALL (2027-05-05-entry-gates.sql, Tyler 2026-11-18): a hero short reads "Requires 10 Rat King wins" and its
//         count "Rat King wins: 2/10", the press off and nothing sent; after a reload, before any quote, the count from the envelope's
//         entry_gates; a seat one short is named ("Tessaly: Rat King wins 9/10"); the envelope's shut gate holds the press off over an older
//         quote; every win earned turns it on; call_wins and party_wins refusals say their numbers and that nothing was charged
//   BW-9  WHAT A WIN EARNS AND WHAT THE ROOM RISKS (audit F24, 2026-11-15: "Why would I pay to fight the Rat King for nothing?"): the section lists what a
//         win can drop from the SERVER'S projection (its rows, its order, its odds: the quote here names odds the data does not hold), above the press;
//         a weak party (a hero under his Level, no tank, no healer, a bar with no food) reads a line for each before the slider and beside it, and no
//         line says a word about Challenge; a room that holds reads none; a server that says neither shows neither
//   BW-8  THE SERIES ONCE IT RUNS: the boss bar says which fight of how many (the server's count), nothing on any other hunt; the summary says how many were won and
//         what the server charged, through the residue's bounds; a series cut short says the hero could not pay another fight
//   BW-4  NO ANSWER, NO PRESS, NO HAMMER: a server that won't quote leaves the press off and is not asked again on the repaint its own answer causes
//   BW-5  NO FREE WAY BACK: Hunt again has nothing to send from a called room, and says why; a normal hunt's still does; both ends have their words
//   BW-6  THE LOSING LINE: names the phase and his HP from the server's record, this hero's own count, and what answers it; a won fight, a walk-out and a normal hunt have none; it survives the residue's bounds
//   BW-7  THE BOSS BAR: his name, a mark on each line where the row puts it, his HP at the instant shown, what each line brought; quiet on any other hunt, and once the fight is over
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
/* THE SERVER'S QUOTE (hr_boss_call_view, 2027-04-24-boss-call-series.sql): one fight's price, the slider's top, what the room covers, and the bill of every
   count. THE TOTALS ARE DELIBERATELY NOT price x count (each entry is 7 gp and 30 s over): a pane that multiplies instead of reading them shows another number. */
const TOP = 40;
const QUOTE = (o = {}) => {
  const q = Object.assign({ call: 'rat_king', available: true, why: null, who: null, price: 50, fight_fee: 50, fee_pm: 1000, event: null, fight_stamina_ms: 120000,
    max_fights: TOP, limit_ms: 600000, stamina_ms: 28800000, covers: 12, heroes: 1, seats: 2, alone: false,
    /* what a win can drop, the server's: the Kingstooth at odds the data does not hold (1.23%, not its 1%), so a page that read monsters.js shows another list */
    drops: [{ item: 'rat_tail', ppm: 1000000, band: 'common' }, { item: 'kingstooth', ppm: 12300, band: 'rare' }, { item: 'rat_kings_crown', ppm: 1410, band: 'trophy' }],
    /* a room that holds: at his Level, a tank and a healer in it, food on every bar */
    danger: { boss_level: 25, under: 0, lowest: 31, tank: true, healer: true, no_food: 0 } }, o);
  q.totals = o.totals || { fee: Array.from({ length: q.max_fights }, (_, i) => (i + 1) * q.price + (q.price ? 7 : 0)), stamina_ms: Array.from({ length: q.max_fights }, (_, i) => (i + 1) * q.fight_stamina_ms + 30000) };
  return q;
};
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
  /* the page's first load is the harness, not a rule: a cold or loaded runner takes it past the 6 s rule timeout (tests/tally-window.mjs) */
  await page.goto(base + '/play.html', { waitUntil: 'load', timeout: 60000 });
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
  /* The slider, moved the way a hand moves it: its value set and an `input` fired (no release: it must answer as it moves). */
  const slide = (page, n) => page.evaluate((v) => { const el = document.querySelector('.hw-call-n'); el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; }, n);
  const facts = (page) => page.evaluate(() => Object.fromEntries(['count', 'f-stamina', 'f-cost', 'f-limit', 'f-pay', 'f-total', 'f-covers', 'f-ends']
    .map((k) => { const e = document.querySelector('.hw-call-' + k); return [k, e && e.offsetParent !== null ? e.textContent : null]; })));
  try {
    /* BW-1: ALONE, A WARNING AND NEVER A LOCK (the designer's ruling 2, 2026-11-10): the press is on, the warning carries one more line, one confirm calls one fight */
    {
      const { ctx, page, errors, s } = await open({}, QUOTE({ seats: 1, alone: true }));
      if ((await txt(page, '.hw-call-line')) !== 'A fight costs 2 min of stamina and 50 gp.') fails.push('BW-1 alone reads ' + JSON.stringify(await txt(page, '.hw-call-line')));
      if (await off(page) !== false) fails.push('BW-1 alone, the press is off');
      if ((await txt(page, '.hw-call-press')) !== 'Call out the Rat King') fails.push('BW-1 the press reads ' + JSON.stringify(await txt(page, '.hw-call-press')));
      /* BW-10 THE CONFIRM OPENS IN VIEW (QA audit 2026-11-18 N3: it opened under the press, below the page's fold and cut by the Enter foot): the page
         scrolled just far enough to show the press at its foot, as a player reads down to it, a press opens the warning and its confirm stands in the page's box */
      await page.evaluate(() => { const box = document.querySelector('.hw-hd-page'), b = document.querySelector('.hw-call-press');
        box.scrollTop += b.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom; b.click(); });
      await page.waitForTimeout(200);
      const seen = await page.evaluate(() => { const box = document.querySelector('.hw-hd-page').getBoundingClientRect(), go = document.querySelector('[data-hs-act="call-go"]'), g = go.getBoundingClientRect();
        return { top: Math.round(g.top), bottom: Math.round(g.bottom), box: [Math.round(box.top), Math.round(box.bottom)], hit: document.elementFromPoint(g.left + g.width / 2, g.top + g.height / 2) === go }; });
      if (!(seen.top >= seen.box[0] && seen.bottom <= seen.box[1] && seen.hit)) fails.push('BW-10 the confirm opened out of view: ' + JSON.stringify(seen));
      if (sent(s, 'hr_boss_call').length) fails.push('BW-1 the first press charged');
      const lone = await txt(page, '.hw-call-note-alone') || '';
      if (lone !== 'Recommended: 2+ players' || !await shown(page, '.hw-call-note-alone')) fails.push('BW-1 alone, the warning\'s own line reads ' + JSON.stringify(lone));
      const warned = await txt(page, '.hw-call-warn') || '';
      if (!/Cost: 50 gp a fight, win or lose/.test(warned) || !/50% HP: summons adds that target non-tanks/.test(warned)) fails.push('BW-1 alone, the warning reads ' + JSON.stringify(warned));
      if ((await txt(page, '[data-hs-act="call-go"]')) !== 'Call him out once') fails.push('BW-1 one fight\'s confirm reads ' + JSON.stringify(await txt(page, '[data-hs-act="call-go"]')));
      await press(page, '[data-hs-act="call-go"]', 'BW-1');
      await page.waitForTimeout(500);
      const calls = sent(s, 'hr_boss_call');
      if (calls.length !== 1 || calls[0].body.p_price !== 50 || calls[0].body.p_fights !== 1 || calls[0].body.p_call !== 'rat_king') fails.push('BW-1 alone, the press sent ' + JSON.stringify(calls.map((c) => c.body)));
      const msg = await page.evaluate(() => (document.querySelector('.hw-hunts .hh-intent-msg') || {}).textContent || '');
      if (!/The Rat King answers, heading in/.test(msg) || /party/.test(msg)) fails.push('BW-1 alone, the answer reads ' + JSON.stringify(msg));
      await page.click('.hw-hunt[data-hunt="mill_cellar"]');
      await page.waitForTimeout(200);
      if (await shown(page, '.hw-hd-call')) fails.push('BW-1 a ground with no boss to call shows the section');
      if (errors.length) fails.push('BW-1 console errors: ' + errors.join(' | ').slice(0, 300));
      await ctx.close();
    }
    {
      const { ctx, page } = await open(PARTY(1), QUOTE({ available: false, why: 'call_leader' }));
      if (!/Party leader only/.test(await txt(page, '.hw-call-line') || '')) fails.push('BW-1 a member reads ' + JSON.stringify(await txt(page, '.hw-call-line')));
      if (await off(page) !== true) fails.push('BW-1 a member\'s press is not off');
      await ctx.close();
    }
    /* ...and a seat that can't pay the first fight is named, the press off (the server's `why` and `who`) */
    {
      const { ctx, page } = await open(PARTY(0), QUOTE({ available: false, why: 'party_stamina', who: 'Tessaly', covers: 0 }));
      if ((await txt(page, '.hw-call-line')) !== 'Tessaly: not enough stamina for a fight') fails.push('BW-1 a seat with no stamina reads ' + JSON.stringify(await txt(page, '.hw-call-line')));
      if (await off(page) !== true) fails.push('BW-1 the press is on with a seat that can\'t pay');
      await ctx.close();
    }
    {
      const { ctx, page } = await open({}, QUOTE({ available: false, why: 'call_stamina', covers: 0, seats: 1, alone: true }));
      if ((await txt(page, '.hw-call-line')) !== 'Requires 2 min of stamina a fight') fails.push('BW-1 a hero with no stamina reads ' + JSON.stringify(await txt(page, '.hw-call-line')));
      if (await off(page) !== true) fails.push('BW-1 the press is on with no stamina for a fight');
      await ctx.close();
    }
    /* BW-2: THE SLIDER, THEN ONE PRESS */
    {
      const { ctx, page, s, errors } = await open(PARTY(0), QUOTE({}));
      if ((await txt(page, '.hw-call-line')) !== 'A fight costs 2 min of stamina and 50 gp.') fails.push('BW-2 the page reads ' + JSON.stringify(await txt(page, '.hw-call-line')));
      if (await off(page) !== false) fails.push('BW-2 the leader\'s press is off');
      await press(page, '[data-hs-act="call-warn"]', 'BW-2');
      await page.waitForTimeout(150);
      if (sent(s, 'hr_boss_call').length) fails.push('BW-2 the first press charged');
      if (!await shown(page, '.hw-call-warn')) fails.push('BW-2 no warning');
      const warned = await txt(page, '.hw-call-warn') || '';
      if (!/Ends if anyone dies/.test(warned) || !/50% HP: summons adds that target non-tanks/.test(warned) || !/25% HP: hits even harder/.test(warned)) fails.push('BW-2 the warning reads ' + JSON.stringify(warned));
      if (/no XP, coin or drops|3 times today|calls left/i.test(warned)) fails.push('BW-2 the warning still reads the one-fight rules: ' + JSON.stringify(warned));
      /* a party's leader reads no lone line: the room holds the party */
      /* the lone line's words are BW-1's ("Recommended: 2+ players" since the labels sweep). Its element holds no words at all for a party, shown or not. */
      if (/Recommended: \d+\+ players/.test(warned) || await txt(page, '.hw-call-note-alone') || await shown(page, '.hw-call-note-alone')) fails.push('BW-2 a party\'s warning reads the lone line: ' + JSON.stringify(warned));
      /* the slider: 1 to the server's top, one fight to begin with, every number the quote's */
      const range = await page.evaluate(() => { const el = document.querySelector('.hw-call-n'); return el ? { min: el.min, max: el.max, value: el.value, shown: el.offsetParent !== null } : null; });
      if (!range || range.min !== '1' || range.max !== String(TOP) || range.value !== '1' || !range.shown) fails.push('BW-2 the slider reads ' + JSON.stringify(range) + ', want 1 to the server\'s ' + TOP);
      const one = await facts(page);
      const wantOne = { count: 'Fights: 1', 'f-stamina': 'Stamina: 2 min a fight', 'f-cost': 'Cost: 50 gp a fight, win or lose', 'f-limit': 'Time limit: 10 min a fight', 'f-pay': 'Drops on a win. No XP or coin.',
        'f-total': 'Total: 2.5 min of stamina, 57 gp', 'f-covers': 'Affordable now: 12 fights', 'f-ends': 'Ends on a death, or when stamina or gold runs out' };
      if (JSON.stringify(one) !== JSON.stringify(wantOne)) fails.push('BW-2 at one fight the warning reads ' + JSON.stringify(one));
      /* moved to 5, not released: it answers as it moves, and the total is the SERVER'S entry for 5 (10.5 min and 257 gp, not 5 x 2 min and 5 x 50 gp) */
      await slide(page, 5);
      await page.waitForTimeout(150);
      const five = await facts(page);
      if (five.count !== 'Fights: 5' || five['f-total'] !== 'Total: 10.5 min of stamina, 257 gp') fails.push('BW-2 at five fights the warning reads ' + JSON.stringify({ count: five.count, total: five['f-total'] }));
      if ((await txt(page, '[data-hs-act="call-go"]')) !== 'Call him out 5 times') fails.push('BW-2 five fights\' confirm reads ' + JSON.stringify(await txt(page, '[data-hs-act="call-go"]')));
      if (sent(s, 'hr_boss_call').length) fails.push('BW-2 moving the slider sent something');
      await press(page, '[data-hs-act="call-no"]', 'BW-2');
      await page.waitForTimeout(150);
      if (await shown(page, '.hw-call-warn')) fails.push('BW-2 Not yet left the warning up');
      await press(page, '[data-hs-act="call-warn"]', 'BW-2');
      await press(page, '[data-hs-act="call-go"]', 'BW-2');
      await page.waitForTimeout(500);
      const calls = sent(s, 'hr_boss_call');
      if (calls.length !== 1) fails.push('BW-2 ' + calls.length + ' calls went out');
      else if (calls[0].body.p_call !== 'rat_king' || calls[0].body.p_price !== 50 || calls[0].body.p_fights !== 5 || calls[0].body.p_slot !== 0 || !calls[0].body.p_idem || Object.keys(calls[0].body).length !== 5) fails.push('BW-2 the press sent ' + JSON.stringify(calls[0].body));
      if (errors.length) fails.push('BW-2 console errors: ' + errors.join(' | ').slice(0, 300));
      await ctx.close();
    }
    /* ...a smaller top is the slider's top, and a fight that costs no gold reads so (the server's quote of 0), stamina the same */
    {
      const { ctx, page } = await open(PARTY(0), QUOTE({ max_fights: 7, price: 0, covers: 7, heroes: 2 }));
      if ((await txt(page, '.hw-call-line')) !== 'A fight costs 2 min of stamina and no gold.') fails.push('BW-2 a fight with no fee reads ' + JSON.stringify(await txt(page, '.hw-call-line')));
      await press(page, '[data-hs-act="call-warn"]', 'BW-2');
      await page.waitForTimeout(150);
      const got = await slide(page, 40);
      await page.waitForTimeout(150);
      const f = await facts(page);
      if (got !== '7' || f.count !== 'Fights: 7') fails.push('BW-2 a top of 7 let the slider reach ' + got + ' and reads ' + JSON.stringify(f.count));
      if (f['f-cost'] !== 'Cost: no gold' || f['f-total'] !== 'Total: 14.5 min of stamina') fails.push('BW-2 a fight with no fee reads ' + JSON.stringify({ cost: f['f-cost'], total: f['f-total'] }));
      const heroes = await page.evaluate(() => { const e = document.querySelector('.hw-call-f-heroes'); return e && e.offsetParent !== null ? e.textContent : null; });
      if (heroes !== 'Your 2 heroes: stamina each, gold shared') fails.push('BW-2 two of this account\'s heroes read ' + JSON.stringify(heroes));
      await ctx.close();
    }
    /* BW-11: NATURAL WINS BEFORE THE CALL (2027-05-05-entry-gates.sql; Tyler 2026-11-18: "you have to beat the boss in the hunting ground X times before
       you can call them out"). Every number is the server's: the quote's `wins`, or before a quote and after a reload the envelope's entry_gates. */
    {
      const wins = (have, short = []) => ({ boss: 'rat_king', need: 10, have, short });
      const gate = (have, short = []) => ({ entry_gates: { tower: null, calls: { rat_king: { ...wins(have, short.map((x, i) => ({ seat: i + 1, ...x }))), ok: have >= 10 && !short.length } } } });
      const lines = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.hw-hd-call .hw-call-wins li')).map((li) => li.textContent));
      const reopen = async (page) => {
        await page.reload({ waitUntil: 'load', timeout: 60000 });
        if (await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'), null, 4000)) await page.click('[data-app="play"][data-slot="0"]');
        await wait(page, () => document.querySelector('.hs-launchers'));
        if (!(await page.evaluate(() => !!document.querySelector('.hw-hunt[data-hunt="millrace_sewer"]')))) await page.click('[data-hs-open="hunts"]');
        await page.click('.hw-hunt[data-hunt="millrace_sewer"]');
        await page.waitForTimeout(600);
      };
      /* ALONE, TWO WINS: the press off, the line says what it takes, the count under it; nothing sent */
      const short = QUOTE({ available: false, why: 'call_wins', seats: 1, alone: true, wins: wins(2) });
      let o = await open(gate(2), short);
      if ((await txt(o.page, '.hw-call-line')) !== 'Requires 10 Rat King wins') fails.push('BW-11 two wins, the line reads ' + JSON.stringify(await txt(o.page, '.hw-call-line')));
      if ((await lines(o.page)).join('|') !== 'Rat King wins: 2/10') fails.push('BW-11 two wins, the count reads ' + JSON.stringify(await lines(o.page)));
      if (await off(o.page) !== true) fails.push('BW-11 two wins, the press is on');
      /* AFTER A RELOAD with the server not quoting yet: the count from the envelope, the press still off */
      o.s.view = null;
      await reopen(o.page);
      if ((await lines(o.page)).join('|') !== 'Rat King wins: 2/10' || await off(o.page) !== true) fails.push('BW-11 after a reload, before a quote, the count reads ' + JSON.stringify([await lines(o.page), await off(o.page)]));
      if (sent(o.s, 'hr_boss_call').length) fails.push('BW-11 a press held off by its wins sent a call');
      await o.ctx.close();
      /* A PARTY, A SEAT ONE WIN SHORT: the line names it with the server's count, the press off, no second line for the same seat */
      o = await open({ ...PARTY(0), ...gate(10, [{ name: 'Tessaly', have: 9 }]) }, QUOTE({ available: false, why: 'party_wins', who: 'Tessaly', wins: wins(10, [{ name: 'Tessaly', have: 9 }]) }));
      if ((await txt(o.page, '.hw-call-line')) !== 'Tessaly: Rat King wins 9/10') fails.push('BW-11 a seat one short, the line reads ' + JSON.stringify(await txt(o.page, '.hw-call-line')));
      if ((await lines(o.page)).length || await off(o.page) !== true) fails.push('BW-11 a seat one short reads ' + JSON.stringify([await lines(o.page), await off(o.page)]));
      await o.ctx.close();
      /* THE SECTION SAYS SHUT, AN OLDER QUOTE SAID YES: the press stays off (the server's newest word) */
      o = await open(gate(9), QUOTE({ seats: 1, alone: true, wins: wins(10) }));
      if (await off(o.page) !== true) fails.push('BW-11 the envelope\'s shut gate left the press on');
      await o.ctx.close();
      /* THE HAPPY PATH: the wins earned on both, the press on, no count line; the server refuses anyway (a win it no longer counts) and the line says
         nothing was charged, with its numbers; a seat's refusal names the seat */
      let answer = () => ({ ok: false, error: 'call_wins', boss_call: QUOTE({ available: false, why: 'call_wins', seats: 1, alone: true, wins: wins(9) }) });
      o = await open(gate(12), QUOTE({ seats: 1, alone: true, wins: wins(12) }), (b) => answer(b));
      if ((await lines(o.page)).length || await off(o.page) !== false) fails.push('BW-11 every win earned reads ' + JSON.stringify([await lines(o.page), await off(o.page)]));
      await press(o.page, '[data-hs-act="call-warn"]', 'BW-11');
      await press(o.page, '[data-hs-act="call-go"]', 'BW-11');
      await o.page.waitForTimeout(500);
      let msg = await o.page.evaluate(() => (document.querySelector('.hw-hunts .hh-intent-msg') || {}).textContent || '');
      if (!/Requires 10 Rat King wins, not charged/.test(msg)) fails.push('BW-11 a call_wins refusal reads ' + JSON.stringify(msg));
      if (sent(o.s, 'hr_boss_call').length !== 1) fails.push('BW-11 the happy press sent ' + sent(o.s, 'hr_boss_call').length + ' calls');
      await o.ctx.close();
      answer = () => ({ ok: false, error: 'party_wins', boss_call: QUOTE({ available: false, why: 'party_wins', who: 'Tessaly', wins: wins(10, [{ name: 'Tessaly', have: 9 }]) }) });
      o = await open({ ...PARTY(0), ...gate(10) }, QUOTE({ wins: wins(10) }), (b) => answer(b));
      await press(o.page, '[data-hs-act="call-warn"]', 'BW-11');
      await press(o.page, '[data-hs-act="call-go"]', 'BW-11');
      await o.page.waitForTimeout(500);
      msg = await o.page.evaluate(() => (document.querySelector('.hw-hunts .hh-intent-msg') || {}).textContent || '');
      if (!/Tessaly: Rat King wins 9\/10, nobody charged/.test(msg)) fails.push('BW-11 a party_wins refusal reads ' + JSON.stringify(msg));
      if (o.errors.length) fails.push('BW-11 console errors: ' + o.errors.join(' | ').slice(0, 300));
      await o.ctx.close();
    }
    /* BW-9: WHAT A WIN CAN DROP, FROM THE SERVER'S PROJECTION, and THE DANGER a weak party reads before the slider */
    {
      const dropsOf = (page) => page.evaluate(() => ({ head: (() => { const h = document.querySelector('.hw-call-drops-h'); return h && h.offsetParent !== null ? h.textContent : null; })(),
        rows: Array.from(document.querySelectorAll('.hw-call-drops .hw-call-drop')).filter((li) => li.offsetParent !== null).map((li) => [li.querySelector('b').textContent, li.querySelector('span').textContent]) }));
      const dangerOf = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.hw-call-danger li')).filter((li) => li.offsetParent !== null).map((li) => li.textContent));
      const WEAK = { boss_level: 25, under: 2, lowest: 12, tank: false, healer: false, no_food: 1 };
      const { ctx, page, s } = await open(PARTY(0), QUOTE({ danger: WEAK }));
      const d = await dropsOf(page);
      const want = [['Rat Tail', 'every win'], ['Kingstooth', '1.23% a win'], ['Rat King\'s Crown', '0.14% a win']];
      if (d.head !== 'A win can drop' || JSON.stringify(d.rows) !== JSON.stringify(want)) fails.push('BW-9 the drops read ' + JSON.stringify(d) + ', want the server\'s three rows and odds');
      const wantDanger = ['The Rat King: Level 25 vs your lowest Level 12 (expect to lose)', 'No tank (bring a hero with a sword and a shield)',
        'No healer (bring one, or your best food on every bar)', 'No food on 1 hero\'s bar'];
      const before = await dangerOf(page);
      if (JSON.stringify(before) !== JSON.stringify(wantDanger)) fails.push('BW-9 a weak party reads ' + JSON.stringify(before) + ' before the press');
      await press(page, '[data-hs-act="call-warn"]', 'BW-9');
      await page.waitForTimeout(150);
      /* ...and still, with the slider on the page: the danger stands above it */
      const beside = await page.evaluate(() => { const li = document.querySelector('.hw-call-danger li'), sl = document.querySelector('.hw-call-n');
        return li && sl && li.offsetParent !== null && sl.offsetParent !== null ? li.getBoundingClientRect().top < sl.getBoundingClientRect().top : false; });
      if (!beside || JSON.stringify(await dangerOf(page)) !== JSON.stringify(wantDanger)) fails.push('BW-9 with the slider up the danger reads ' + JSON.stringify(await dangerOf(page)) + (beside ? '' : ', not above the slider'));
      const all = await page.evaluate(() => document.querySelector('.hw-hd-call').textContent);
      if (/Challenge/.test(all)) fails.push('BW-9 the section says a word about Challenge: ' + JSON.stringify(all.slice(0, 200)));
      if (sent(s, 'hr_boss_call').length) fails.push('BW-9 reading the page sent a call');
      await ctx.close();
    }
    {
      /* a room that holds reads no danger; a server that says neither (an older one) shows no list and no line */
      const dangerOf = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.hw-call-danger li')).filter((li) => li.offsetParent !== null).map((li) => li.textContent));
      const fit = await open(PARTY(0), QUOTE({}));
      if ((await dangerOf(fit.page)).length) fails.push('BW-9 a room that holds reads ' + JSON.stringify(await dangerOf(fit.page)));
      await fit.ctx.close();
      const q = QUOTE({}); delete q.drops; delete q.danger;
      const old = await open(PARTY(0), q);
      const shown2 = await old.page.evaluate(() => ({ rows: document.querySelectorAll('.hw-call-drops .hw-call-drop').length, head: (document.querySelector('.hw-call-drops-h') || {}).hidden, danger: document.querySelectorAll('.hw-call-danger li').length }));
      if (shown2.rows || shown2.head !== true || shown2.danger) fails.push('BW-9 a server that names no drops and no danger shows ' + JSON.stringify(shown2));
      if (await off(old.page) !== false) fails.push('BW-9 a quote with no drops list turned the press off');
      await old.ctx.close();
    }
    /* BW-3 */
    {
      const moved = QUOTE({ price: 60 });
      const { ctx, page, s } = await open(PARTY(0), QUOTE({}), (b) => (b.p_price === 60 ? { ok: true, boss_call: moved } : { ok: false, error: 'quote_changed', boss_call: moved }));
      await press(page, '[data-hs-act="call-warn"]', 'BW-3');
      await slide(page, 3);
      await press(page, '[data-hs-act="call-go"]', 'BW-3');
      await page.waitForTimeout(500);
      const msg = await page.evaluate(() => (document.querySelector('.hw-hunts .hh-intent-msg') || {}).textContent || '');
      if (!/not charged/.test(msg)) fails.push('BW-3 the answer reads ' + JSON.stringify(msg));
      if ((await txt(page, '.hw-call-line')) !== 'A fight costs 2 min of stamina and 60 gp.') fails.push('BW-3 the page still reads ' + JSON.stringify(await txt(page, '.hw-call-line')));
      await press(page, '[data-hs-act="call-warn"]', 'BW-3');
      await press(page, '[data-hs-act="call-go"]', 'BW-3');
      await page.waitForTimeout(500);
      const calls = sent(s, 'hr_boss_call');
      if (calls.length !== 2 || calls[1].body.p_price !== 60 || calls[1].body.p_fights !== 3) fails.push('BW-3 the second press sent ' + JSON.stringify(calls.map((c) => [c.body.p_fights, c.body.p_price])));
      await ctx.close();
    }
    /* ...and a count the server refuses says so with the server's top (bad_fights) */
    {
      const { ctx, page } = await open(PARTY(0), QUOTE({}), () => ({ ok: false, error: 'bad_fights', max_fights: 25 }));
      await press(page, '[data-hs-act="call-warn"]', 'BW-3');
      await press(page, '[data-hs-act="call-go"]', 'BW-3');
      await page.waitForTimeout(500);
      const msg = await page.evaluate(() => (document.querySelector('.hw-hunts .hh-intent-msg') || {}).textContent || '');
      if (msg !== 'Pick 1 to 25 fights, not charged') fails.push('BW-3 a refused count reads ' + JSON.stringify(msg));
      await ctx.close();
    }
    /* BW-4 */
    {
      const { ctx, page, s } = await open(PARTY(0), null);
      await page.waitForTimeout(1500);
      if (await off(page) !== true) fails.push('BW-4 with no quote the press is on');
      if (!/Checking…/.test(await txt(page, '.hw-call-line') || '')) fails.push('BW-4 off with no words: ' + JSON.stringify(await txt(page, '.hw-call-line')));
      if (sent(s, 'hr_boss_call_view').length > 1) fails.push('BW-4 asked ' + sent(s, 'hr_boss_call_view').length + ' times in a moment');
      await ctx.close();
    }
    /* BW-5: the module as this page serves it (a mutant's text included). */
    {
      const { ctx, page } = await open({}, QUOTE({ available: false, why: 'call_leader' }));
      const r = await page.evaluate(async () => {
        const v = new URL(Array.from(document.querySelectorAll('link[rel="modulepreload"]'), (l) => l.href).find((h) => h.includes('/summary-model.js'))).search;
        const M = await import('/src/hunt-view/summary-model.js' + v);
        return { room: M.huntAgainOf({ hunt: 'millrace_sewer_called', preset: 0, hoursLimit: null, bag: [] }), ground: M.huntAgainOf({ hunt: 'millrace_sewer', preset: 0, hoursLimit: null, bag: [] }),
          felled: M.endWords('boss_felled'), time: M.endWords('boss_time') };
      });
      if (r.room !== null) fails.push('BW-5 Hunt again has something to send from a called room');
      if (!r.ground) fails.push('BW-5 Hunt again is gone from a normal hunt');
      if (r.felled === 'Hunt ended' || r.time === 'Hunt ended') fails.push('BW-5 an end has no words: ' + JSON.stringify(r));
      await ctx.close();
    }
    /* BW-6, BW-7: the modules as this page serves them. */
    {
      const { ctx, page } = await open({}, QUOTE({ available: false, why: 'call_leader' }));
      const r = await page.evaluate(async () => {
        const hrefOf = (name) => new URL(Array.from(document.querySelectorAll('link[rel="modulepreload"]'), (l) => l.href).find((h) => h.includes(name)));
        const L = await import(hrefOf('/boss-loss.js').href);
        const S = await import(hrefOf('/summary-model.js').href);
        const B = await import(hrefOf('/boss-bar.js').href);
        const P = await import(hrefOf('/boss-call-pane.js').href);
        const BC = await import(hrefOf('/boss-calls.js').href);
        const room = 'millrace_sewer_called';
        const line = (reason, boss_pm, fired, role, hunt = room) => L.lossLine({ hunt, reason, fight: { boss_pm, fired }, role });
        const lines = {
          enrageTank: line('died', 230, { eat: 6, challenge: 2 }, 'tank'), enrageHealer: line('party_member_died', 230, { greater_mend: 9, circle_of_renewal: 3, eat: 1 }, 'healer'),
          addsMage: line('died', 410, { fireball: 0, frost_lance: 4 }, 'mage'), addsHealer: line('died', 410, { greater_mend: 2, eat: 9 }, 'healer'), addsTank: line('party_member_died', 410, { challenge: 1 }, 'tank'),
          first: line('died', 800, { eat: 1 }, 'melee_dps'), time: line('boss_time', 230, { eat: 1 }, 'tank'), floor: line('died', 3, { eat: 1 }, 'tank'),
          won: line('boss_felled', 0, { eat: 1 }, 'tank'), left: line('left', 230, { eat: 1 }, 'tank'), normal: line('died', 230, { eat: 1 }, 'tank', 'millrace_sewer'),
          none: L.lossLine({ hunt: room, reason: 'died', fight: null, role: 'tank' }),
          /* The Chief's diggers shield him (isGuarded): his add wave and his enrage have their own answers. */
          chiefAdds: line('died', 410, { fireball: 3 }, 'mage', 'coppercap_warrens_called'), chiefEnrage: line('died', 230, { eat: 2 }, 'tank', 'coppercap_warrens_called'),
          /* a shielded boss's tank whose Challenge fired in his enrage is told how often (a fact, never advice) */
          chiefEnrageCh: line('died', 230, { eat: 2, challenge: 3 }, 'tank', 'coppercap_warrens_called'),
          /* KRELL'S HALL (March play-through 2026-11-14): his enrage line talked about eating and never Challenge, the wrong press there */
          krellEnrage: line('died', 230, { eat: 3, challenge: 4 }, 'tank', 'krells_hold_hall'), krellEnrageHealer: line('died', 230, { greater_mend: 5 }, 'healer', 'krells_hold_hall'),
          krellAdds: line('died', 410, { challenge: 2 }, 'tank', 'krells_hold_hall'),
        };
        const sess = { read: (k) => (k === 'hunt' ? { session_id: 'sid', ended: true, session: { id: 'sid', hunt_id: room, end_reason: 'died', ended_at: '2026-11-05T10:00:00Z', tally: { deaths: 1, fight: { boss_pm: 230, fired: { eat: 6 } } } } } : null) };
        const ended = S.endedSessionOf(sess);
        const built = S.buildSummary(ended, null, [], 'tank');
        const kept = S.sanitizeSummaries([built])[0];
        /* `call`: the session's series as hr_hunt_view writes it (2027-04-24-boss-call-series.sql), or none */
        const bar = (hunt, hp, over, played, kind = 'rat_king_called', call = null) => {
          const el = document.createElement('div');
          el.innerHTML = B.renderBossBar();
          const cs = { read: (k) => (k === 'hunt' ? { session_id: 's', hunt_id: hunt, ended: !!over, ...(call ? { session: { call } } : {}), pose: { units: [{ u: 5, kind, side: 'monster', boss: true, name: 'Rat King', hp, hp_max: 1000 }] } } : null),
            timeline: { hpAt: () => played || null }, now: () => 0 };
          B.renderBossBar.patch(el, { character: cs });
          const q = (s) => el.querySelector(s);
          return { quiet: el.classList.contains('is-quiet'), name: q('.hs-boss-name').textContent, state: q('.hs-boss-state').textContent, fill: q('.hs-boss-fill').style.width, series: q('.hs-boss-series').textContent,
            adds: q('.hs-boss-mark.is-adds').style.left, enrage: q('.hs-boss-mark.is-enrage').style.left, wave: q('.hs-boss').classList.contains('is-wave'), raging: q('.hs-boss').classList.contains('is-raging') };
        };
        /* BW-8: a series' session as it ended, out of stamina after 3 of 5 fights, 2 of them won; and one fight won with no fee (Open Halls) */
        const CALL = { fights: 5, fight: 3, won: 2, fee: 50, stamina_ms: 120000, paid_gold: 150, paid_stamina_ms: 360000 };
        const seriesOf = (call, reason) => {
          const e = S.endedSessionOf({ read: (k) => (k === 'hunt' ? { session_id: 'ser', ended: true, session: { id: 'ser', hunt_id: room, end_reason: reason, ended_at: '2026-11-15T10:00:00Z', tally: { deaths: 0 }, ...(call ? { call } : {}) } } : null) });
          const b = S.buildSummary(e, null, [], 'tank');
          return { call: e && e.call, line: b.series, kept: (S.sanitizeSummaries([b])[0] || {}).series };
        };
        return { lines, ended: ended && ended.fight, loss: built.loss, kept: kept && kept.loss,
          series: { short: seriesOf(CALL, 'stamina'), free: seriesOf({ fights: 1, fight: 1, won: 1, fee: 0, stamina_ms: 120000, paid_gold: 0, paid_stamina_ms: 120000 }, 'boss_felled'), none: seriesOf(null, 'boss_felled'),
            forged: seriesOf({ fights: '5', fight: 3, won: 2 }, 'stamina'), lost: built.series,
            words: { stamina: S.endWords('stamina', false, null, 'A', null, room), gold: S.endWords('gold_out', false, null, 'A', null, room), ground: S.endWords('stamina', false, null, 'A', null, 'millrace_sewer'),
              hall: S.endWords('stamina', false, null, 'A', null, 'krells_hold_hall') } },
          bars: { full: bar(room, 1000), half: bar(room, 500), quarter: bar(room, 240), played: bar(room, 1000, false, { hp: 240, maxHp: 1000 }), normal: bar('millrace_sewer', 1000), over: bar(room, 240, true), chief: bar('coppercap_warrens_called', 500, false, null, 'chief_coppercap_called'),
            second: bar(room, 1000, false, null, 'rat_king_called', CALL), forged: bar(room, 1000, false, null, 'rat_king_called', { fights: 5, fight: 'x', won: 0 }),
            /* A GROUND'S BOSS WITH LINES (Captain Hask): his bar once he is hurt, none before */
            hask: bar('muster_barrows', 400, false, null, 'captain_hask'), haskFull: bar('muster_barrows', 1000, false, null, 'captain_hask'), haskOver: bar('muster_barrows', 400, true, null, 'captain_hask') },
          warn: { king: P.callWords(BC.BOSS_CALL_WORDS.warn[0], BC.BOSS_CALLS.rat_king), chief: P.callWords(BC.BOSS_CALL_WORDS.warn[0], BC.BOSS_CALLS.chief_coppercap) } };
      });
      const l = r.lines;
      const want = (rule, name, re) => { if (!re.test(l[name] || '')) fails.push(rule + ' ' + name + ' reads ' + JSON.stringify(l[name])); };
      want('BW-6', 'enrageTank', /^Lost after his enrage, boss at 23%\nFood eaten: 6\n.*eat earlier/i);
      want('BW-6', 'enrageHealer', /^Lost after his enrage, boss at 23%\nHeals cast: 12\n/);
      want('BW-6', 'addsMage', /^Lost during his adds, boss at 41%\nArea slot casts: 0\n.*Cleave, Fireball/);
      want('BW-6', 'addsHealer', /^Lost during his adds, boss at 41%\nHeals cast: 2\n/);
      want('BW-6', 'addsTank', /^Lost during his adds, boss at 41%\nChallenge casts: 1\n/);
      want('BW-6', 'chiefAdds', /^Lost during his adds, boss at 41%\nArea slot casts: 3\nTip: Kill his adds first, heal whoever they attack$/);
      want('BW-6', 'chiefEnrage', /^Lost after his enrage, boss at 23%\nFood eaten: 2\nTip: Better tank armor, earlier food, faster heals$/);
      want('BW-6', 'chiefEnrageCh', /^Lost after his enrage, boss at 23%\nChallenge casts: 3\n/);
      want('BW-6', 'krellEnrage', /^Lost after his enrage, boss at 23%\nChallenge casts: 4\nTip: Better tank armor, earlier food, faster heals$/);
      want('BW-6', 'krellEnrageHealer', /^Lost after his enrage, boss at 23%\nHeals cast: 5\nTip: .*faster heals$/);
      want('BW-6', 'krellAdds', /^Lost during his adds, boss at 41%\nChallenge casts: 2\nTip: Kill his adds first/);
      /* NO LINE TELLS A PLAYER TO TURN CHALLENGE ON OR OFF (Tyler 2026-11-14: "the player should decide whether or not challenge should be on") */
      for (const [k, x] of Object.entries(l)) if (/Challenge (off|on)|off your tank|Keep Challenge|Take Challenge/.test(x || '')) fails.push('BW-6 ' + k + ' tells the player what to do with Challenge: ' + JSON.stringify(x));
      if (/Challenge/.test(l.enrageTank || '')) fails.push('BW-6 the King, whose rats shield nothing, is asked about Challenge in his enrage: ' + JSON.stringify(l.enrageTank));
      if (/shield/.test(l.addsMage || '')) fails.push('BW-6 the King, whose rats shield nothing, reads ' + JSON.stringify(l.addsMage));
      want('BW-6', 'first', /^Lost before his adds, boss at 80%\nFood eaten: 1\n/);
      want('BW-6', 'time', /^Time up after his enrage, boss at 23%\n/);
      want('BW-6', 'floor', /at 1%\n/);
      for (const n of ['won', 'left', 'normal', 'none']) if (l[n] !== null) fails.push('BW-6 ' + n + ' has a line: ' + l[n]);
      if (!r.ended || r.ended.boss_pm !== 230) fails.push('BW-6 the ended session lost the record: ' + JSON.stringify(r.ended));
      if (!/^Lost after his enrage, boss at 23%\nFood eaten: 6/.test(r.loss || '')) fails.push('BW-6 the summary reads ' + JSON.stringify(r.loss));
      if (r.kept !== r.loss) fails.push('BW-6 the residue\'s bounds lost the line: ' + JSON.stringify(r.kept));
      const b = r.bars;
      if (b.full.quiet || b.full.name !== 'The Rat King' || b.full.adds !== '50%' || b.full.enrage !== '25%' || b.full.fill !== '100%' || b.full.wave || b.full.raging) fails.push('BW-7 at full he reads ' + JSON.stringify(b.full));
      if (!b.half.wave || b.half.raging || b.half.state !== 'Adds incoming') fails.push('BW-7 at the first line he reads ' + JSON.stringify(b.half));
      /* A boss whose adds shield him says so, on the bar and in the warning; one whose adds don't, never (boss-calls.js isGuarded). */
      if (!b.chief.wave || b.chief.state !== 'Shielded by adds') fails.push('BW-7 the Chief at his first line reads ' + JSON.stringify(b.chief));
      if (!/summons adds that target non-tanks and shield him until killed\n25% HP/.test(r.warn.chief) || /Challenge/.test(r.warn.chief) || /shield/.test(r.warn.king) || /{guard}/.test(r.warn.king + r.warn.chief)) fails.push('BW-7 the warnings read ' + JSON.stringify(r.warn));
      if (b.quarter.wave || !b.quarter.raging || b.quarter.state !== 'Enraged' || b.quarter.fill !== '24%') fails.push('BW-7 under the second line he reads ' + JSON.stringify(b.quarter));
      if (!b.played.raging || b.played.fill !== '24%') fails.push('BW-7 the bar does not read the instant shown: ' + JSON.stringify(b.played));
      if (!b.normal.quiet) fails.push('BW-7 a normal hunt has a boss bar');
      if (!b.over.quiet) fails.push('BW-7 a finished fight still has a boss bar');
      if (b.hask.quiet || b.hask.name !== 'Captain Hask' || !b.hask.wave || b.hask.state !== 'Adds incoming' || b.hask.adds !== '50%' || b.hask.enrage !== '25%') fails.push('BW-7 Captain Hask hurt on his ground reads ' + JSON.stringify(b.hask));
      if (!b.haskFull.quiet) fails.push('BW-7 Captain Hask has a bar before anyone hurt him');
      if (!b.haskOver.quiet) fails.push('BW-7 a finished hunt at the Barrows still has his bar');
      /* BW-8: THE SERIES ONCE IT RUNS. The bar says which fight of how many, the server's count; nothing for one fight's old room, a forged count or any other hunt. */
      if (b.second.series !== 'Fight 3 of 5' || b.second.name !== 'The Rat King') fails.push('BW-8 the bar of a series reads ' + JSON.stringify({ name: b.second.name, series: b.second.series }));
      if (b.full.series !== '' || b.forged.series !== '' || b.hask.series !== '' || b.chief.series !== '') fails.push('BW-8 a bar with no series reads ' + JSON.stringify([b.full.series, b.forged.series, b.hask.series, b.chief.series]));
      const sr = r.series;
      if (sr.short.line !== 'Won 2 of 3 fights. Paid 6 min of stamina and 150 gp.') fails.push('BW-8 the summary of a series reads ' + JSON.stringify(sr.short.line));
      if (sr.short.kept !== sr.short.line) fails.push('BW-8 the residue\'s bounds lost the series\' line: ' + JSON.stringify(sr.short.kept));
      if (sr.free.line !== 'Won 1 of 1 fight. Paid 2 min of stamina.') fails.push('BW-8 one fight with no fee reads ' + JSON.stringify(sr.free.line));
      if (sr.none.line !== null || sr.forged.line !== null || sr.lost !== null || sr.none.call !== null) fails.push('BW-8 a room with no series, or a forged one, has a line: ' + JSON.stringify([sr.none.line, sr.forged.line, sr.lost]));
      if (!/^Out of stamina for another fight/.test(sr.words.stamina) || !/^Out of gold for another fight/.test(sr.words.gold)) fails.push('BW-8 a series cut short reads ' + JSON.stringify(sr.words));
      if (!/^Out of stamina · /.test(sr.words.ground) || !/^Out of stamina · /.test(sr.words.hall)) fails.push('BW-8 a normal hunt, or a hall, reads a series\' end: ' + JSON.stringify(sr.words));
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

const MUTANTS = [
  /* BW-11 NATURAL WINS BEFORE THE CALL (lane/c-entry-gates) */
  { name: 'wins: the press ignores the envelope\x27s shut gate', file: 'src/shell/windows/boss-call-pane.js', from: 'const open = !!q && q.available && !v.now && !v.pending && !(gate && !gate.ok);', to: 'const open = !!q && q.available && !v.now && !v.pending;', want: /BW-11/ },
  { name: 'wins: the wins still owed are never drawn', file: 'src/shell/windows/boss-call-pane.js', from: "rows(box.querySelector('.hw-call-wins'), v.now ? [] :", to: "rows(box.querySelector('.hw-call-wins'), v.now || true ? [] :", want: /BW-11/ },
  { name: 'wins: the count waits for a quote', file: 'src/shell/windows/boss-call-pane.js', from: 'const w = q && q.wins ? q.wins : gate || null;', to: 'const w = q && q.wins ? q.wins : null;', want: /BW-11/ },
  { name: 'wins: a seat short of wins is read with the caller\x27s count', file: 'src/shell/windows/boss-call-pane.js', from: 'return { need: q.wins.need, ...(who ? (seat ? { have: seat.have } : {}) : { have: q.wins.have }) };', to: 'return { need: q.wins.need, have: q.wins.have };', want: /BW-11/ },
  { name: 'wins: the quote drops its wins', file: 'src/session/boss-quote.js', from: 'danger: dangerOf(q.danger), wins: winsOf(q.wins),', to: 'danger: dangerOf(q.danger), wins: null,', want: /BW-11/ },
  /* BW-10 (QA audit 2026-11-18 N3): the confirm opens in view */
  { name: 'the confirm opens below the page\'s fold', file: 'src/shell/windows/hunts.js', from: '}), el)) return inView();', to: '}), el)) return true;' },
  { name: 'the first press charges', file: 'src/shell/windows/boss-call-pane.js', from: "if (action === 'call-warn') { sc.warned = true; repaint(); return true; }", to: "if (action === 'call-warn') { run(() => callOut(ctx.account, cs, sc.call.id, 1, sc.quote.price), '', () => ''); return true; }", want: /BW-2/ },
  { name: 'the press sends the data\'s fee, not the server\'s', file: 'src/shell/windows/boss-call-pane.js', from: 'run(() => callOut(ctx.account, cs, call.id, n, quote.price),', to: 'run(() => callOut(ctx.account, cs, call.id, n, call.fight.fee),', want: /BW-3/ },
  /* THE SLIDER (Tyler 2026-11-14): the count it picked is what is sent, its top is the server's, it answers as it moves, and no number beside it is made here */
  { name: 'the press sends one fight whatever the slider says', file: 'src/shell/windows/boss-call-pane.js', from: 'run(() => callOut(ctx.account, cs, call.id, n, quote.price),', to: 'run(() => callOut(ctx.account, cs, call.id, 1, quote.price),', want: /BW-2/ },
  { name: 'the total is a sum made in the browser', file: 'src/shell/windows/boss-call-pane.js', from: 'stamina: q.totals.staminaMs[n - 1], gold: q.totals.fee[n - 1],', to: 'stamina: n * q.staminaMs, gold: n * q.price,', want: /BW-2/ },
  { name: 'the slider runs past the server\'s top', file: 'src/shell/windows/boss-call-pane.js', from: "attr(slider, 'max', String(q.maxFights));", to: "attr(slider, 'max', '1000');", want: /BW-2/ },
  { name: 'the slider answers only on release', file: 'src/shell/windows/hunts.js', from: "renderHunts.events = Object.freeze(['input']);", to: 'renderHunts.events = Object.freeze([]);', want: /BW-2/ },
  { name: 'a fight with no fee still reads its fee\'s words', file: 'src/shell/windows/boss-call-pane.js', from: 'callWords(free ? S.costFree : S.cost, call, bill)', to: 'callWords(S.cost, call, bill)', want: /BW-2/ },
  { name: 'what the room covers is never said', file: 'src/shell/windows/boss-call-pane.js', from: "text(warn.querySelector('.hw-call-f-covers'), callWords(q.covers === 0 ? S.covers.none : q.covers === 1 ? S.covers.one : S.covers.other, call, bill));", to: '', want: /BW-2/ },
  { name: 'a seat that can\'t pay is not named', file: 'src/shell/windows/boss-call-pane.js', from: 'max: q.maxFights, who: q.who, heroes: q.heroes,', to: 'max: q.maxFights, heroes: q.heroes,', want: /BW-1/ },
  { name: 'a refused count never says the server\'s top', file: 'src/shell/windows/boss-call-pane.js', from: '...(Number.isFinite(r.max) ? { max: r.max } : {}),', to: '', want: /BW-3/ },
  /* WHAT A WIN EARNS AND WHAT THE ROOM RISKS (audit F24) */
  { name: 'the drops are the data\'s table, not the server\'s', file: 'src/shell/windows/boss-call-pane.js', from: 'const drops = !v.now && q ? q.drops : [];', to: 'const drops = !v.now && q ? MONSTERS[call.monster].drops.map((x) => ({ item: x.id, ppm: Math.round(x.ch * 1000000) })) : [];', want: /BW-9/ },
  { name: 'the page never says what a win can drop', file: 'src/shell/windows/boss-call-pane.js', from: 'const drops = !v.now && q ? q.drops : [];', to: 'const drops = [];', want: /BW-9/ },
  { name: 'the odds are rounded to a whole percent', file: 'src/shell/windows/boss-call-pane.js', from: "String(Math.round(ppm / 100) / 100)", to: 'String(Math.round(ppm / 10000))', want: /BW-9/ },
  { name: 'a weak party reads no warning', file: 'src/shell/windows/boss-call-pane.js', from: "rows(box.querySelector('.hw-call-danger'), v.now ? [] : dangerLines(q, call),", to: "rows(box.querySelector('.hw-call-danger'), [],", want: /BW-9/ },
  { name: 'a room with no tank is not told', file: 'src/shell/windows/boss-call-pane.js', from: '  if (!d.tank) out.push(W.tank);\n', to: '', want: /BW-9/ },
  { name: 'a hero under his Level is not told', file: 'src/shell/windows/boss-call-pane.js', from: 'if (d.under > 0 && d.lowest !== null) out.push(', to: 'if (false) out.push(', want: /BW-9/ },
  { name: 'the warning tells the player what to do with Challenge', file: 'src/data/boss-calls.js', from: "    tank: 'No tank (bring a hero with a sword and a shield)',", to: "    tank: 'No tank (bring one with Challenge on)',", want: /BW-9/ },
  { name: 'a room that holds is warned anyway', file: 'src/shell/windows/boss-call-pane.js', from: '  if (!d.healer) out.push(W.healer);\n', to: '  out.push(W.healer);\n', want: /BW-9/ },
  /* THE SERIES ONCE IT RUNS */
  { name: 'the bar never says which fight', file: 'src/shell/widgets/boss-bar.js', from: "h.call ? BOSS_CALL_WORDS.series.now.replace('{fight}', String(h.call.fight)).replace('{fights}', String(h.call.fights)) : ''", to: "''", want: /BW-8/ },
  { name: 'a series has no line on the summary', file: 'src/hunt-view/summary-model.js', from: 'series: seriesLine(s.call || null),', to: 'series: null,', want: /BW-8/ },
  { name: 'the series\' line counts the fights called, not the fights fought', file: 'src/hunt-view/boss-loss.js', from: ".replace('{fought}', String(c.fight));", to: ".replace('{fought}', String(c.fights));", want: /BW-8/ },
  { name: 'a series cut short reads as a hunt that ran out of stamina', file: 'src/hunt-view/summary-model.js', from: "if (forfeit !== true && hunt && Object.hasOwn(short, reason) && (roomOfHunt(hunt) || {}).kind === 'call') return short[reason];", to: '', want: /BW-8/ },
  { name: 'a hall\'s end reads a series\' words', file: 'src/hunt-view/summary-model.js', from: "(roomOfHunt(hunt) || {}).kind === 'call') return short[reason];", to: 'roomOfHunt(hunt)) return short[reason];', want: /BW-8/ },
  { name: 'the press is on with no quote', file: 'src/shell/windows/boss-call-pane.js', from: 'const open = !!q && q.available && !v.now && !v.pending && !(gate && !gate.ok);', to: 'const open = !v.now && !v.pending && !(gate && !gate.ok);', want: /BW-1|BW-4/ },
  { name: 'a moved price is not read back', file: 'src/shell/windows/boss-call-pane.js', from: '.then((r) => { if (r && r.quote) sc.quote = r.quote; else sc.at = 0; repaint(); });', to: '.then(() => { repaint(); });', want: /BW-3/ },
  { name: 'every repaint asks again', file: 'src/shell/windows/boss-call-pane.js', from: 'if (!sc.asking && !v.now && now - sc.at > QUOTE_STANDS_MS) {', to: 'if (!sc.asking && !v.now && (!sc.quote || now - sc.at > QUOTE_STANDS_MS)) {', want: /BW-4/ },
  { name: 'a won fight gets a losing line', file: 'src/hunt-view/boss-loss.js', from: '|| !LOST.includes(o.reason)) return null;', to: ') return null;', want: /BW-6/ },
  { name: 'the line reads the wrong phase', file: 'src/hunt-view/boss-loss.js', from: "return bossPm <= ph.enragePm ? 'enrage' : bossPm <= ph.addsPm ? 'adds' : 'first';", to: "return bossPm <= ph.addsPm ? 'adds' : 'first';", want: /BW-6/ },
  { name: 'a shielded boss\'s wave reads the plain answer', file: 'src/hunt-view/boss-loss.js', from: "guarded && phase === 'adds' ? W.answer.guarded : ", to: '', want: /BW-6/ },
  { name: 'a shielded boss\'s enrage reads the plain answer', file: 'src/hunt-view/boss-loss.js', from: "guarded && phase === 'enrage' ? W.answer.enrageGuarded : ", to: '', want: /BW-6/ },
  { name: 'the tank is asked about his food', file: 'src/hunt-view/boss-loss.js', from: "if (role === 'tank' && (phase === 'adds' ||", to: "if (role === 'nobody' && (phase === 'adds' ||", want: /BW-6/ },
  { name: 'the warning tells the player to turn Challenge off again', file: 'src/data/boss-calls.js', from: "  warnGuard: ' and shield him until killed',", to: "  warnGuard: ' and shield him until killed (take Challenge off your tank\\'s bar)',", want: /BW-7/ },
  { name: 'a shielded boss\'s tank is asked about his food once Challenge fired', file: 'src/hunt-view/boss-loss.js', from: "(guarded && sum(fired, ['challenge']) > 0)", to: 'false', want: /BW-6/ },
  { name: 'a mark in the wrong place', file: 'src/shell/widgets/boss-bar.js', from: "'left', (ph.enragePm / 10) + '%'", to: "'left', (ph.addsPm / 10) + '%'", want: /BW-7/ },
  { name: 'the bar reads the snapshot, not the instant shown', file: 'src/shell/widgets/boss-bar.js', from: 'const hp = played ? played.hp : x ? x.hp : NaN, max = played ? played.maxHp : x ? x.hpMax : 0;', to: 'const hp = x ? x.hp : NaN, max = x ? x.hpMax : 0;', want: /BW-7/ },
  { name: 'the bar stands on every hunt', file: 'src/shell/widgets/boss-bar.js', from: "cls(el, 'is-quiet', !ph);", to: "cls(el, 'is-quiet', false);", want: /BW-7/ },
  { name: 'a ground boss has no bar', file: 'src/shell/widgets/boss-bar.js', from: 'return groundBossOf(cs, h);', to: 'return null;', want: /BW-7/ },
  { name: 'a ground boss has his bar before he is hurt', file: 'src/shell/widgets/boss-bar.js', from: 'if (pm === null || pm <= 0 || pm >= 1000) continue;', to: 'if (pm === null || pm <= 0) continue;', want: /BW-7/ },
  /* ALONE, A WARNING (the designer's ruling 2, 2026-11-10): the lone line shows for a hero alone, only for one, and the answer names no party. */
  { name: 'a hero alone reads no lone line', file: 'src/shell/windows/boss-call-pane.js', from: "prop(alone, 'hidden', !q.alone);", to: "prop(alone, 'hidden', true);", want: /BW-1/ },
  { name: 'a party reads the lone line', file: 'src/shell/windows/boss-call-pane.js', from: "text(alone, q.alone ? partyNote(call.from) || BOSS_CALL_WORDS.warnAlone : '');", to: "text(alone, partyNote(call.from) || BOSS_CALL_WORDS.warnAlone);", want: /BW-2/ },
  { name: 'a hero alone is told the party is on its way', file: 'src/shell/windows/boss-call-pane.js', from: 'const answered = quote.alone ? BOSS_CALL_WORDS.answered.alone : BOSS_CALL_WORDS.answered.party;', to: 'const answered = BOSS_CALL_WORDS.answered.party;', want: /BW-1/ },
  { name: 'a free way back from the room', file: 'src/hunt-view/summary-model.js', from: ' || roomOfHunt(summary.hunt)) return null;', to: ') return null;', want: /BW-5/ },
];

async function main() {
  if (process.argv.includes('--mutate') || process.argv.includes('--selftest')) {
    if (process.env.HR_MUTANT_CONTROL) { const f = await checks(); console.log('boss-call-window --mutate: control ran the clean tree: ' + (f.join('; ') || 'green')); process.exit(0); }
    let escaped = 0;
    /* --mutant=<part of a name>: those alone (a lane proves its own); the plain --mutate runs every one */
    const pick = (process.argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
    const list = MUTANTS.filter((m) => !pick || m.name.includes(pick));
    for (const m of list) {
      const src = (await readFile(join(ROOT, m.file), 'utf8'));
      if (src.split(m.from).length !== 2) throw new Error('anchor: ' + m.name);
      let got;
      try { got = await checks({ [m.file]: src.replace(m.from, () => m.to) }); } catch (e) { got = ['THREW ' + String(e && e.message).slice(0, 160)]; }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + String(got[0] || 'every rule held').slice(0, 130));
    }
    console.log(escaped ? `boss-call-window --mutate: ${escaped} ESCAPED` : `boss-call-window --mutate: ${list.length}/${list.length} caught`);
    process.exit(escaped ? 1 : 0);
  }
  const fails = await checks();
  for (const f of fails) console.log('FAIL  ' + f);
  console.log(fails.length ? 'boss-call-window: ' + fails.length + ' FAILED' : 'boss-call-window: green (the server\'s words, the warning, one press, a moved price, no hammer, no free way back)');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
