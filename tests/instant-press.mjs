#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/instant-press.mjs — EVERY PRESS ANSWERS AT ONCE, AND ?debug=live (tracker r20, r21).
//
//   node tests/instant-press.mjs            the rules
//   node tests/instant-press.mjs --mutate   every planted defect must turn a rule RED
//   node tests/instant-press.mjs --shots <dir>  also write the popup and the answer in view (1440x900, 667x375)
//
// mutant-anchors: src/shell/press-ack.js src/session/intent-ledger.js src/session/character-session.js src/app/live-overlay.js src/shell/windows/play-cap.js src/shell/intent-words.js src/styles/windows.css src/shell/widgets/alerts.js
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
//   IP-6  THE PLAY CAP IN THE MIDDLE OF THE SCREEN (Tyler 2026-11-01), at 1440x900, 922x423 and 667x375: a gather
//         Start and a hunt Enter refused by the cap open one centered popup with the plain words, nothing at the
//         window's foot, OK closes it; a party's Start names the seat; another refusal stays on the window's line
//   IP-7  THE ANSWER IS IN VIEW (Tyler 2026-11-01: "it was hard to see"): a refused Shop Buy and a refused Start,
//         pressed high in a window that scrolls, say why on screen, and the pressed control stays there, uncovered
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';

const { ITEMS } = await import(pathToFileURL(join(ROOT, 'src/data/items.js')).href);
const { BUILD } = await import(pathToFileURL(join(ROOT, 'src/build-info.js')).href);
const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const SECTIONS = {
  stamina_refill: { available: true, why: null, ms: 0, max_ms: 28800000, restore_ms: 14400000, price: 1400, n: 2, per_day: 6, level: 10 },
  blessings: { held: [1], permille: 320, free_until: 30, tiers: [
    { tier: 1, permille: 320, price: 110, held: true }, { tier: 2, permille: 630, price: 165, held: false },
    { tier: 3, permille: 950, price: 220, held: false }] },
};
/* The hero in town, nothing running: the doors that start a hero are open. */
const townEnv = () => {
  const e = Object.assign(clone(BASE_ENV), clone(SECTIONS));
  e.hunt = null; e.party = null; e.hunt_track = null; e.hunt_events = [];
  e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null });
  /* A Buy tab long enough to scroll: the first items, as tools at 1 g each. */
  e.shop.offers = Object.keys(ITEMS).slice(0, 16).map((item) => ({ offer: 'tool.' + item, item, kind: 'tool', price: 1 }));
  return e;
};
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
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
    if (name === 'hr-accrue') {
      const body = r.request().postDataJSON() || {};
      /* The engine's refusal as it answers: HTTP 409, the code in the body (tests/play-cap.mjs PC-CLOSED). */
      const no = body.verb && s.edgeNo && s.edgeNo[body.verb];
      if (no) return r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: no }) });
      return json(Object.assign(clone(s.env), { version: ++s.version, ok: true }));
    }
    if (s.rpcNo && s.rpcNo[name]) return json(s.rpcNo[name]);
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
  const start = async (query, viewport, env) => {
    const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const s = { env: env || Object.assign(clone(BASE_ENV), clone(SECTIONS)), version: 1, calls: [], loadDelay: 0 };
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
  /* In the game, in town, at this size. */
  const inTown = async (viewport, env) => {
    const run = await start('', viewport, env || townEnv());
    await run.page.click('[data-app="play"][data-slot="0"]');
    await wait(run.page, () => document.querySelector('.hs-launchers'));
    return run;
  };
  const press = (page, q) => page.evaluate((x) => { const b = document.querySelector(x); if (!b || b.disabled) return false; b.scrollIntoView({ block: 'nearest' }); b.click(); return true; }, q);
  const answered = (page, q) => wait(page, (x) => { const m = document.querySelector(x); return m && m.textContent && !/…$/.test(m.textContent); }, q, 4000);
  const openWoodcutting = async (page) => {
    await page.keyboard.press('g');
    await wait(page, () => document.querySelector('[data-hs-win="skills-trade"] .hw-skill[data-skill="woodcutting"]'), null, 4000);
    await press(page, '[data-hs-win="skills-trade"] .hw-skill[data-skill="woodcutting"]');
    await wait(page, () => document.querySelector('.hw-work-go[data-kind="gather"]:not([disabled])'), null, 4000);
  };
  const POPUP = '[data-hs-win="play-cap"] .hplaycap-words';
  /* The popup as a player meets it: where it stands, its words, its size, what is under its OK, and every window's line. */
  const readPopup = (page) => page.evaluate(() => {
    const w = document.querySelector('[data-hs-win="play-cap"]');
    if (!w) return null;
    const r = w.getBoundingClientRect();
    const ok = w.querySelector('[data-hs-act="play-cap-ok"]');
    const o = ok.getBoundingClientRect();
    const hit = document.elementFromPoint(o.left + o.width / 2, o.top + o.height / 2);
    /* Centered in the World, the box the windows stand in (the death popup's place), under the icon row. */
    const b = w.parentElement.getBoundingClientRect();
    return { dx: Math.abs(r.left + r.width / 2 - (b.left + b.width / 2)), dy: Math.abs(r.top + r.height / 2 - (b.top + b.height / 2)),
      off: Math.abs(r.top + r.height / 2 - innerHeight / 2) / innerHeight,
      fits: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, modal: w.classList.contains('is-modal'),
      title: w.querySelector('.hs-win-title').textContent, words: w.querySelector('.hplaycap-words').textContent,
      seats: w.querySelector('.hplaycap-seats').textContent, px: parseFloat(getComputedStyle(w.querySelector('.hplaycap-words')).fontSize),
      okHit: !!hit && ok.contains(hit), buttons: w.querySelectorAll('[data-hs-body] button').length,
      lines: [...document.querySelectorAll('.hs-win:not([data-hs-win="play-cap"]) .hh-intent-msg')].map((m) => m.textContent).filter(Boolean) };
  });
  const popupRule = (tag, door, p, words) => {
    if (!p) { fails.push('IP-6 [' + tag + '] ' + door + ': no popup opened'); return; }
    if (!p.modal || !p.fits || p.dx > 2 || p.dy > 2 || p.off > 0.12) fails.push('IP-6 [' + tag + '] ' + door + ': not in the middle of the screen: ' + JSON.stringify(p));
    if (p.words !== words) fails.push('IP-6 [' + tag + '] ' + door + ': it says ' + JSON.stringify(p.words));
    if (!(p.px >= 12) || !p.okHit || p.buttons !== 1) fails.push('IP-6 [' + tag + '] ' + door + ': unreadable, or not one OK to press: ' + JSON.stringify(p));
    if (p.lines.length) fails.push('IP-6 [' + tag + '] ' + door + ': the old line is still on the window: ' + JSON.stringify(p.lines));
  };
  /* The window's line on screen and the top thing there, and the pressed control still in view inside the scrolled body. */
  const readInView = (page, win, line, pressed) => page.evaluate(([w0, l0, p0]) => {
    const w = document.querySelector('[data-hs-win="' + w0 + '"]');
    const body = w.querySelector('[data-hs-body]');
    const m = w.querySelector(l0);
    const b = body.getBoundingClientRect(), r = m.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const pb = w.querySelector(p0);
    const p = pb.getBoundingClientRect();
    const under = document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2);
    return { text: m.textContent, room: body.scrollHeight - body.clientHeight, px: parseFloat(getComputedStyle(m).fontSize),
      inBody: r.top >= b.top - 1 && r.bottom <= b.bottom + 1 && r.height > 0, onTop: !!hit && m.contains(hit),
      pressedIn: p.top >= b.top - 1 && p.bottom <= b.bottom + 1 && !!under && pb.contains(under) };
  }, [win, line, pressed]);
  const inViewRule = (tag, door, a) => {
    if (a.room < 40) fails.push('IP-7 [' + tag + '] ' + door + ': HARNESS: this window does not scroll here: ' + JSON.stringify(a));
    if (!a.text || !a.inBody || !a.onTop || !(a.px >= 12)) fails.push('IP-7 [' + tag + '] ' + door + ': the answer is off screen: ' + JSON.stringify(a));
    if (!a.pressedIn) fails.push('IP-7 [' + tag + '] ' + door + ': the answer moved the pressed row away: ' + JSON.stringify(a));
  };
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
    // IP-6: each size, a gather Start and a hunt Enter; the two refusals, each with its own words.
    const HERE = 'Four heroes are already playing from this internet connection. They can be on any account here. Stop one to start this one.';
    const OWN = 'Four of your heroes are already playing. Stop one to start this one.';
    for (const [tag, viewport] of [['1440x900', { width: 1440, height: 900 }], ['922x423', { width: 922, height: 423 }], ['667x375', { width: 667, height: 375 }]]) {
      const { ctx, page, errors, s } = await inTown(viewport);
      s.edgeNo = { set_activity: 'too_many_playing_here' };
      s.rpcNo = { hr_hunt_enter: { ok: false, error: 'too_many_playing', max: 4 } };
      await openWoodcutting(page);
      await press(page, '.hw-work-go[data-kind="gather"]:not([disabled])');
      await answered(page, POPUP);
      await sleep(50);
      popupRule(tag, 'a gather Start', await readPopup(page), HERE);
      if (SHOTS) { await mkdir(SHOTS, { recursive: true }); await page.screenshot({ path: join(SHOTS, 'play-cap-gather-' + tag + '.png') }); }
      await press(page, '[data-hs-act="play-cap-ok"]');
      if (!(await wait(page, () => !document.querySelector('[data-hs-win="play-cap"]'), null, 2000))) fails.push('IP-6 [' + tag + '] OK did not close the popup');
      await page.keyboard.press('h');
      await wait(page, () => document.querySelector('.hw-hunt[data-hunt]'), null, 4000);
      await press(page, '.hw-hunt[data-hunt]');
      await wait(page, () => document.querySelector('.hw-hunt-enter:not([disabled])'), null, 4000);
      await press(page, '.hw-hunt-enter');
      await answered(page, POPUP);
      await sleep(50);
      popupRule(tag, 'a hunt Enter', await readPopup(page), OWN);
      if (SHOTS) await page.screenshot({ path: join(SHOTS, 'play-cap-enter-' + tag + '.png') });
      await press(page, '[data-hs-act="play-cap-ok"]');
      await wait(page, () => !document.querySelector('[data-hs-win="play-cap"]'), null, 2000);
      /* Any other refusal stays where it is today: on the window's line, no popup. */
      s.rpcNo = { hr_hunt_enter: { ok: false, error: 'no_stamina' } };
      await press(page, '.hw-hunt-enter');
      await answered(page, '.hw-hd-foot .hh-intent-msg');
      await sleep(50);
      const other = await page.evaluate(() => ({ line: document.querySelector('.hw-hd-foot .hh-intent-msg').textContent, popup: !!document.querySelector('[data-hs-win="play-cap"]') }));
      if (!other.line || other.popup) fails.push('IP-6 [' + tag + '] another refusal did not stay on the window\'s line: ' + JSON.stringify(other));
      if (SHOTS) await page.screenshot({ path: join(SHOTS, 'answer-enter-' + tag + '.png') });
      const stray = errors.filter((e) => !/409/.test(e));
      if (stray.length) fails.push('IP-6 [' + tag + '] console errors: ' + stray.join(' | ').slice(0, 300));
      await ctx.close();
    }
    { // IP-6, a party's Start: the seat the cap holds back is named, and nobody's line says it twice.
      const env = townEnv();
      env.party = { id: '5d1c0f2e-0000-4000-8000-0000000000aa', leader_seat: 0, self_seat: 0, max: 4, members: [
        { seat: 0, name: 'Tyler', level: 24, weapon: 'shield', hunting: false }, { seat: 1, name: 'Mira', level: 22, weapon: 'bow', hunting: false }] };
      const { ctx, page, s } = await inTown(null, env);
      s.rpcNo = { hr_hunt_party_start: { ok: false, error: 'not_ready', seats: [{ seat: 1, name: 'Mira', error: 'too_many_playing_here' }] } };
      await page.keyboard.press('h');
      await wait(page, () => /Start with party/.test((document.querySelector('.hw-hunt-enter') || {}).textContent || ''), null, 4000);
      await press(page, '.hw-hunt-enter');
      await answered(page, POPUP);
      await sleep(50);
      const p = await readPopup(page);
      popupRule('1440x900', 'a party Start', p, HERE);
      if (p && !/Mira would be a fifth hero/.test(p.seats)) fails.push('IP-6 a party Start does not name the seat: ' + JSON.stringify(p && p.seats));
      if (SHOTS) await page.screenshot({ path: join(SHOTS, 'play-cap-party-1440x900.png') });
      await ctx.close();
    }
    { // IP-6, an alert's Start again: the alert's own line stays empty for the cap (the popup says it) and speaks for anything else.
      const { ctx, page } = await inTown({ width: 1440, height: 900 });
      const said = await page.evaluate(async (v) => {
        const { renderAlerts } = await import('/src/shell/widgets/alerts.js?v=' + v);
        renderAlerts.patch = () => {};
        const run = async (error) => {
          const marks = [];
          const a = { key: 'k', action: 'restart', session: 's', slot: 0 };
          await renderAlerts.act({ alerts: { list: () => [a], mark: (k, on, msg) => marks.push(msg), dismiss() {} }, peers: () => [{ slot: 0, restartHunt: async () => ({ ok: false, error }) }] },
            {}, 'alert-do', { type: 'click' }, { getAttribute: () => 'k' });
          return marks[marks.length - 1];
        };
        return [await run('too_many_playing'), await run('no_stamina')];
      }, BUILD.version);
      if (said[0] !== '' || !said[1]) fails.push('IP-6 an alert\'s line reads ' + JSON.stringify(said));
      await ctx.close();
    }
    // IP-7: the press is high in a window that scrolls, and the line's own place is below the fold.
    for (const [tag, viewport] of [['1440x900', { width: 1440, height: 900 }], ['667x375', { width: 667, height: 375 }]]) {
      const { ctx, page, s } = await inTown(viewport);
      s.edgeNo = { shop_buy: 'quote_changed', set_activity: 'bag_full' };
      await page.keyboard.press('v');
      const buy = '[data-hs-win="shop"] [data-pane="buy"] [data-hs-act="buy"]:not([disabled])';
      await wait(page, (q) => document.querySelector(q), buy, 4000);
      await press(page, buy);
      await answered(page, '.hw-shop > .hh-intent-msg');
      await sleep(50);
      inViewRule(tag, 'a refused Buy', await readInView(page, 'shop', '.hw-shop > .hh-intent-msg', '[data-pane="buy"] [data-hs-act="buy"]'));
      if (SHOTS) await page.screenshot({ path: join(SHOTS, 'answer-buy-' + tag + '.png') });
      if (await page.evaluate(() => !!document.querySelector('[data-hs-win="play-cap"]'))) fails.push('IP-7 [' + tag + '] a refused Buy opened the play-cap popup');
      await openWoodcutting(page);
      await press(page, '.hw-work-go[data-kind="gather"]:not([disabled])');
      await answered(page, '.hw-trade > .hh-intent-msg');
      await sleep(50);
      if (tag === '667x375') inViewRule(tag, 'a refused Start', await readInView(page, 'skills-trade', '.hw-trade > .hh-intent-msg', '.hw-work-go'));
      if (SHOTS) await page.screenshot({ path: join(SHOTS, 'answer-start-' + tag + '.png') });
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
  ['the play cap opens no popup', 'src/shell/windows/play-cap.js', "    ctx.wm.open('play-cap');\n", ''],
  ['the play cap also shows at the window\'s foot', 'src/shell/intent-words.js', "playCapOf(r) ? '' : refusalText(r, cs)", 'refusalText(r, cs)'],
  ['a party\'s Start held back by the cap opens no popup', 'src/shell/intent-words.js', "r.error === 'not_ready' && Array.isArray(r.seats) ? r.seats.find((x) => x && PLAY_CAP.has(x.error)) : null", 'null'],
  ['every refusal opens the popup', 'src/shell/intent-words.js', 'if (PLAY_CAP.has(r.error)) return r.error;', "if (r.error) return 'too_many_playing';"],
  ['an alert also says the play cap on its line', 'src/shell/widgets/alerts.js', "playCapOf(r) ? '' : refusalWords(r.error, a.action === 'join' ? 'party_join' : undefined)", 'refusalWords(r.error)'],
  ['the answer covers the press', 'src/shell/press-ack.js', 'if (p.refused) { refuse(p.el); clearOfAnswer(p.el); }', 'if (p.refused) refuse(p.el);'],
  ['the answer to a press scrolls away', 'src/styles/windows.css', '{ position: sticky; bottom: 0; z-index: 1; padding: 6px 10px; }', '{ padding: 6px 10px; }'],
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
