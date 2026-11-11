#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/live-events-window.mjs — THE LIVE EVENTS IN THE GAME, IN A REAL CHROMIUM (lane/b-live-events-client; the mocks,
// .claude/coordination/mocks/2026-11-10/SPEC.md §2; the server, supabase/migrations/2027-03-22-live-events.sql, its own guard
// tests/live-events.mjs; the section's contract tests/envelope-contract.mjs).
//
//   node tests/live-events-window.mjs            the rules
//   node tests/live-events-window.mjs --mutate   every planted defect must turn a rule RED
//
// mutant-anchors: src/session/boss-quote.js src/session/boss-intents.js src/shell/live-events-view.js src/shell/widgets/event-plate.js src/shell/windows/boss-call-pane.js src/shell/hud.js src/data/settings.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs), in UTC and en-US so the times read one way.
// The stub server states `now` (2026-11-18 18:00 UTC, a Wednesday) and the `live_events` section hr_live_events_view would.
//   LW-OFF    SWITCHED OFF IS INVISIBLE: with the section null (every switch off), or not sent at all, there is no plate, no Hunts
//             line, no line on a ground's page, no line for the plate in HUD layout or Settings, and Call out is today's ("Call out
//             the Rat King for 10,000 gp")
//   LW-PLAY   AN EVENT END TO END (Open Halls and a Bonus XP weekend on): the plates say what the server's rows say ("Open Halls
//             ends 11:00 PM", "+25% Level XP ends Sat 6:00 AM", the event's own words as the tooltip); a press on Open Halls opens
//             Hunts on the Sewer; the Sewer's and the Warrens' lines free their boss, no other line says anything; the page says
//             both events; Call out reads the event's line before the quote's calls left, "for free" on the press; the press only
//             warns (the event's warning, "Call him out for free"); the confirm sends ONE hr_boss_call at the quoted 0; the next
//             answer's dial replaces the plate's percent (+40%); a reload with the switches off takes every piece away
//   LW-FREE   A FREE CALL CAN BE PRESSED (the P2: quoteOf and callOut refused a price under 1): a quote of 0 is a quote, keeps its
//             event, and callOut sends 0; a price under 0 is still no quote and no ask
//   LW-CLOCK  THE SERVER'S CLOCK: an event starting within a day is a quiet "starts" plate and nothing in Hunts; one further out
//             shows nothing; in its last hour it counts down ("ends in 42 min", "Open Halls ends in 42 min."); a fee dial that isn't
//             0 never reads "free"; when the window closes on the server's clock the plate goes at once and Call out reads the
//             quote again (the fee is back)
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
const NOW = Date.parse('2026-11-18T18:00:00Z');
const H = 3600000, MIN = 60000;
const iso = (ms) => new Date(ms).toISOString();
/* A row as hr_live_events_view sends it. */
const HALLS = (o = {}) => Object.assign({ id: 'open_halls', type: 'open_halls', dial: 'feePm', pm: 0, scope: ['world'], starts: iso(NOW - 7 * H), ends: iso(NOW + 5 * H), live: true }, o);
const XP = (o = {}) => Object.assign({ id: 'bonus_weekend', type: 'xp_bonus', dial: 'xpPm', pm: 1250, scope: ['world'], starts: iso(NOW - 6 * H), ends: iso(NOW + 60 * H), live: true }, o);
const QUOTE = (o) => Object.assign({ call: 'rat_king', available: true, why: null, price: 10000, used: 0, per_day: 3, left: 3, seats: 1, alone: true, fee: 10000, fee_pm: 1000, event: null }, o);
const FREE = (o) => QUOTE(Object.assign({ price: 0, fee_pm: 0, event: 'open_halls' }, o));
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await pinFonts(page);
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load' || name === 'hr-accrue') return json(Object.assign(clone(s.env), { version: ++s.version, ok: true, now: iso(NOW + (Date.now() - s.t0)) }));
    if (name === 'hr_boss_call_view') return json({ ok: true, quote: typeof s.view === 'function' ? s.view() : s.view });
    if (name === 'hr_boss_call') return json({ ok: true, entered: 1, party: null, boss_call: typeof s.view === 'function' ? s.view() : s.view });
    return json({ ok: true });
  });
}

async function signInAndPlay(page, base) {
  /* the page's first load is the harness, not a rule (tests/boss-call-window.mjs) */
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
  /* A hero in town, alone, with these events (`events`: the section, or undefined for none sent) and this quote. */
  const open = async (events, view) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'UTC', locale: 'en-US' });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/400|404/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const env = Object.assign(clone(BASE_ENV), { hunt: null, party: null, hunt_track: null, hunt_events: null, hunt_analyzer: null, hunt_server_now_ms: null });
    if (events !== undefined) env.live_events = events;
    env.state = Object.assign({}, env.state, { active_kind: 'idle', active_id: null });
    const s = { env, version: 1, calls: [], view, t0: Date.now() };
    await stub(page, s);
    await signInAndPlay(page, 'http://127.0.0.1:' + port);
    await page.waitForTimeout(300);
    return { ctx, page, errors, s };
  };
  const sent = (s, n) => s.calls.filter((c) => c.name === n);
  const read = (page) => page.evaluate(() => {
    const vis = (e) => !!e && e.offsetParent !== null;
    const box = document.querySelector('[data-hs-widget="events"]');
    const q = (sel) => document.querySelector(sel);
    return {
      plateShown: vis(box),
      plates: Array.from(document.querySelectorAll('.hs-event')).filter(vis).map((b) => ({ head: b.querySelector('b').textContent, when: b.querySelector('.hs-event-when').textContent,
        title: b.getAttribute('title'), soon: b.classList.contains('is-soon'), gain: b.classList.contains('is-gain'), ending: b.classList.contains('is-ending') })),
      rows: Object.fromEntries(Array.from(document.querySelectorAll('.hw-hunt')).map((li) => [li.getAttribute('data-hunt'), Array.from(li.querySelectorAll('.hw-hunt-event')).filter(vis).map((e) => e.textContent)])),
      picked: (q('.hw-hunt.is-picked') || { getAttribute: () => null }).getAttribute('data-hunt'),
      page: Array.from(document.querySelectorAll('.hw-hd-event')).filter(vis).map((p) => ({ text: p.textContent, plain: p.classList.contains('is-plain') })),
      line: (q('.hw-hd-call .hw-call-line') || {}).textContent || null,
      press: (q('.hw-call-press') || {}).textContent || null,
      off: q('.hw-call-press') ? q('.hw-call-press').disabled : null,
      warn: vis(q('.hw-call-warn')) ? { q: q('.hw-call-warn .hw-confirm-q').textContent, b: q('.hw-call-note-b').textContent, go: q('[data-hs-act="call-go"]').textContent } : null,
      msg: (q('.hw-hunts .hh-intent-msg') || {}).textContent || '',
    };
  });
  const hunts = async (page, hunt = 'millrace_sewer') => {
    if (!await page.$('.hw-hunts')) await page.click('[data-hs-open="hunts"]');
    await page.click('.hw-hunt[data-hunt="' + hunt + '"]');
    await page.waitForTimeout(500);
  };
  const press = async (page, sel, rule) => { try { await page.click(sel, { timeout: 1500 }); return true; } catch { fails.push(rule + ' could not press ' + sel); return false; } };
  /* The plate's own settings: its line in HUD layout (key U) and its toggle in Settings, Interface. */
  const settingsLines = async (page) => {
    await page.keyboard.press('u');
    await page.waitForTimeout(400);
    const hud = await page.evaluate(() => !!document.querySelector('[data-hs-wshow="events"]'));
    await page.click('[data-hs-open="settings"]');
    await page.waitForTimeout(500);
    const settings = await page.evaluate(() => { const r = document.querySelector('[data-row="panel.events"]'); return !!r && !r.hasAttribute('hidden'); });
    return { hud, settings };
  };
  try {
    /* LW-OFF: null (every switch off) and not sent (an older server): nothing new anywhere */
    for (const [label, events] of [['a null section', null], ['no section', undefined]]) {
      const { ctx, page, errors } = await open(events, QUOTE({}));
      await hunts(page);
      const r = await read(page);
      if (r.plateShown || r.plates.length) fails.push('LW-OFF ' + label + ': the plate shows ' + JSON.stringify(r.plates));
      const lines = Object.entries(r.rows).filter(([, l]) => l.length);
      if (lines.length) fails.push('LW-OFF ' + label + ': Hunts lines say ' + JSON.stringify(lines));
      if (r.page.length) fails.push('LW-OFF ' + label + ': the page says ' + JSON.stringify(r.page));
      if (r.press !== 'Call out the Rat King for 10,000 gp' || r.line !== '3 calls left today.' || r.off !== false) fails.push('LW-OFF ' + label + ': Call out reads ' + JSON.stringify({ line: r.line, press: r.press, off: r.off }));
      const set = await settingsLines(page);
      if (set.hud || set.settings) fails.push('LW-OFF ' + label + ': the plate\'s setting is listed ' + JSON.stringify(set));
      if (errors.length) fails.push('LW-OFF console errors: ' + errors.join(' | ').slice(0, 300));
      await ctx.close();
    }
    /* LW-PLAY + LW-FREE: Open Halls and a Bonus XP weekend, end to end */
    {
      const { ctx, page, errors, s } = await open([HALLS(), XP()], FREE({}));
      let r = await read(page);
      const want = [{ head: 'Open Halls', when: 'ends 11:00 PM', gain: false }, { head: '+25% Level XP', when: 'ends Sat 6:00 AM', gain: true }];
      if (!r.plateShown || r.plates.length !== 2 || want.some((w, i) => !r.plates[i] || r.plates[i].head !== w.head || r.plates[i].when !== w.when || r.plates[i].gain !== w.gain || r.plates[i].soon))
        fails.push('LW-PLAY the plates read ' + JSON.stringify(r.plates));
      if (!r.plates[1] || r.plates[1].title !== 'Every hunt earns 25% more Level XP until Saturday 6:00 AM, even while you\'re away. Coin, drops and skill XP stay the same.')
        fails.push('LW-PLAY the XP plate\'s tooltip reads ' + JSON.stringify(r.plates[1] && r.plates[1].title));
      /* a press on Open Halls opens Hunts on the ground whose boss it frees */
      await press(page, '.hs-event[data-hunt="millrace_sewer"]', 'LW-PLAY');
      await page.waitForTimeout(600);
      r = await read(page);
      if (r.picked !== 'millrace_sewer') fails.push('LW-PLAY the plate opened Hunts on ' + JSON.stringify(r.picked));
      if (JSON.stringify(r.rows.millrace_sewer) !== JSON.stringify(['Call out the Rat King for free']) || JSON.stringify(r.rows.coppercap_warrens) !== JSON.stringify(['Call out Chief Coppercap for free']))
        fails.push('LW-PLAY the boss grounds\' lines read ' + JSON.stringify({ sewer: r.rows.millrace_sewer, warrens: r.rows.coppercap_warrens }));
      const others = Object.entries(r.rows).filter(([h, l]) => h !== 'millrace_sewer' && h !== 'coppercap_warrens' && l.length);
      if (others.length) fails.push('LW-PLAY a world-wide XP event writes on every line: ' + JSON.stringify(others));
      const pageWant = [{ text: 'Open Halls is on. Call out the Rat King for free until 11:00 PM.', plain: true }, { text: '+25% Level XP this weekend. Ends Saturday 6:00 AM.', plain: false }];
      if (JSON.stringify(r.page) !== JSON.stringify(pageWant)) fails.push('LW-PLAY the page reads ' + JSON.stringify(r.page));
      if (r.line !== 'Open Halls is on until 11:00 PM. 3 calls left today.') fails.push('LW-PLAY Call out\'s line reads ' + JSON.stringify(r.line));
      if (r.press !== 'Call out the Rat King for free') fails.push('LW-PLAY the press reads ' + JSON.stringify(r.press));
      if (r.off !== false) fails.push('LW-FREE a free call\'s press is off');
      await press(page, '[data-hs-act="call-warn"]', 'LW-PLAY');
      await page.waitForTimeout(200);
      r = await read(page);
      if (sent(s, 'hr_boss_call').length) fails.push('LW-PLAY the first press called');
      if (!r.warn || r.warn.q !== 'Call out the Rat King?' || r.warn.go !== 'Call him out for free'
        || r.warn.b !== 'Open Halls is on, so there\'s no fee. You still get no XP, no coin and no drops in this room, only the fight. It ends after 10 minutes.')
        fails.push('LW-PLAY the warning reads ' + JSON.stringify(r.warn));
      /* the next answer (the load after the call) carries a moved dial: the plate shows the server's, not the data's */
      s.env.live_events = [HALLS(), XP({ pm: 1400 })];
      await press(page, '[data-hs-act="call-go"]', 'LW-FREE');
      await page.waitForTimeout(800);
      const calls = sent(s, 'hr_boss_call');
      if (calls.length !== 1 || calls[0].body.p_price !== 0 || calls[0].body.p_call !== 'rat_king') fails.push('LW-FREE the confirm sent ' + JSON.stringify(calls.map((c) => c.body)));
      r = await read(page);
      if (!/The Rat King answers\. You're on your way\./.test(r.msg)) fails.push('LW-PLAY the answer reads ' + JSON.stringify(r.msg));
      if (!r.plates.some((p) => p.head === '+40% Level XP')) fails.push('LW-PLAY the next answer\'s dial is not shown: ' + JSON.stringify(r.plates));
      const set = await settingsLines(page);
      if (!set.hud || !set.settings) fails.push('LW-PLAY switched on, the plate\'s setting is not listed ' + JSON.stringify(set));
      /* the switches go off: a reload shows nothing new, and Call out is today's at the server's fee */
      s.env.live_events = null;
      s.view = QUOTE({});
      await page.reload({ waitUntil: 'load' });
      await wait(page, () => document.querySelector('.hs-launchers'));
      await page.waitForTimeout(400);
      await hunts(page);
      r = await read(page);
      if (r.plateShown || Object.values(r.rows).some((l) => l.length) || r.page.length || r.press !== 'Call out the Rat King for 10,000 gp')
        fails.push('LW-PLAY switched off after a reload, still shows ' + JSON.stringify({ plates: r.plates, page: r.page, press: r.press }));
      if (errors.length) fails.push('LW-PLAY console errors: ' + errors.join(' | ').slice(0, 300));
      await ctx.close();
    }
    /* LW-FREE: the readers themselves, as this page serves them (a mutant's text included) */
    {
      const { ctx, page } = await open(null, QUOTE({}));
      const r = await page.evaluate(async () => {
        const hrefOf = (name) => Array.from(document.querySelectorAll('link[rel="modulepreload"]'), (l) => l.href).find((h) => h.includes(name));
        const Q = await import(hrefOf('/boss-quote.js'));
        const I = await import(hrefOf('/boss-intents.js'));
        const asked = [];
        const account = { server: { rpc: (n, b) => { asked.push(b); return Promise.resolve({ ok: true, body: { ok: true, boss_call: null } }); } } };
        /* a hero in town in no party: what callOut reads of a character (partyPeersOf, settleTownActivity, the reload after) */
        const cs = { slot: 0, status: 'ready', read: () => undefined, load: () => Promise.resolve() };
        let free = null, zero = null, below = null;
        try { free = Q.quoteOf({ price: 0, available: true, left: 3, per_day: 3, used: 0, event: 'open_halls' }); } catch (e) { free = 'threw ' + e.message; }
        try { below = Q.quoteOf({ price: -1, available: true }); } catch (e) { below = 'threw ' + e.message; }
        try { zero = await I.callOut(account, cs, 'rat_king', 0); } catch (e) { zero = { threw: String(e && e.message) }; }
        let neg = null;
        try { neg = await I.callOut(account, cs, 'rat_king', -5); } catch (e) { neg = { threw: String(e && e.message) }; }
        return { free, below, zero: zero && (zero.ok === false ? zero.error : 'sent'), neg: neg && (neg.ok === false ? neg.error : 'sent'), asked: asked.map((b) => b.p_price) };
      });
      if (!r.free || r.free.price !== 0 || r.free.event !== 'open_halls' || r.free.available !== true) fails.push('LW-FREE quoteOf drops a free quote: ' + JSON.stringify(r.free));
      if (r.below !== null) fails.push('LW-FREE a price under 0 is a quote: ' + JSON.stringify(r.below));
      if (r.zero === 'bad_intent' || !r.asked.includes(0)) fails.push('LW-FREE callOut refuses a price of 0: ' + JSON.stringify(r));
      if (r.neg !== 'bad_intent' || r.asked.includes(-5)) fails.push('LW-FREE callOut sends a price under 0: ' + JSON.stringify(r));
      await ctx.close();
    }
    /* LW-CLOCK: soon, further out, the last hour, a fee dial that isn't 0, and a window closing on the server's clock */
    {
      const { ctx, page, errors } = await open([HALLS({ starts: iso(NOW + 17 * H), ends: iso(NOW + 29 * H), live: false }), XP({ starts: iso(NOW + 50 * H), ends: iso(NOW + 122 * H), live: false })], QUOTE({}));
      await hunts(page);
      const r = await read(page);
      if (r.plates.length !== 1 || r.plates[0].head !== 'Open Halls' || r.plates[0].when !== 'starts Thu 11:00 AM' || !r.plates[0].soon || r.plates[0].gain
        || r.plates[0].title !== 'Open Halls starts Thursday 11:00 AM. Calling out the Rat King or Chief Coppercap will be free.')
        fails.push('LW-CLOCK soon and later read ' + JSON.stringify(r.plates));
      if (Object.values(r.rows).some((l) => l.length) || r.page.length || r.press !== 'Call out the Rat King for 10,000 gp') fails.push('LW-CLOCK an event not on yet writes in Hunts: ' + JSON.stringify({ rows: r.rows, page: r.page, press: r.press }));
      if (errors.length) fails.push('LW-CLOCK console errors: ' + errors.join(' | ').slice(0, 300));
      await ctx.close();
    }
    {
      const { ctx, page } = await open([HALLS({ ends: iso(NOW + 42 * MIN) }), XP({ ends: iso(NOW + 42 * MIN) })], FREE({ left: 2, used: 1 }));
      await hunts(page);
      const r = await read(page);
      if (r.plates.length !== 2 || r.plates.some((p) => p.when !== 'ends in 42 min' || !p.ending)) fails.push('LW-CLOCK the last hour reads ' + JSON.stringify(r.plates));
      if (r.line !== 'Open Halls ends in 42 min. 2 calls left today.') fails.push('LW-CLOCK Call out in the last hour reads ' + JSON.stringify(r.line));
      if (!r.page.some((p) => p.text === '+25% Level XP this weekend. Ends in 42 min.') || !r.page.some((p) => p.text === 'Open Halls is on. Call out the Rat King for free. Ends in 42 min.'))
        fails.push('LW-CLOCK the page in the last hour reads ' + JSON.stringify(r.page));
      await ctx.close();
    }
    {
      const { ctx, page } = await open([HALLS({ pm: 500 })], QUOTE({ price: 5000, fee_pm: 500, event: 'open_halls' }));
      await hunts(page);
      const r = await read(page);
      if (Object.values(r.rows).some((l) => l.length) || r.page.length || /free/.test(r.press || '') || r.press !== 'Call out the Rat King for 5,000 gp')
        fails.push('LW-CLOCK a fee dial of 500 reads ' + JSON.stringify({ rows: r.rows, page: r.page, press: r.press }));
      await ctx.close();
    }
    {
      /* Open Halls closes 4 s into the page: the plate goes on the server's clock, and Call out asks again (the fee is back) */
      let closed = false;
      const { ctx, page, s } = await open([HALLS({ ends: iso(NOW + 4000) })], () => (closed ? QUOTE({}) : FREE({})));
      await hunts(page);
      let r = await read(page);
      if (r.press !== 'Call out the Rat King for free' || !r.plates.length) fails.push('LW-CLOCK before the close reads ' + JSON.stringify({ press: r.press, plates: r.plates }));
      closed = true;
      const asked = sent(s, 'hr_boss_call_view').length;
      const gone = await wait(page, () => !document.querySelector('.hs-event'), null, 8000);
      if (!gone) fails.push('LW-CLOCK the plate outlived its window');
      await wait(page, () => (document.querySelector('.hw-call-press') || {}).textContent === 'Call out the Rat King for 10,000 gp', null, 4000);
      r = await read(page);
      if (r.press !== 'Call out the Rat King for 10,000 gp' || sent(s, 'hr_boss_call_view').length <= asked || r.page.length || Object.values(r.rows).some((l) => l.length))
        fails.push('LW-CLOCK after the close reads ' + JSON.stringify({ press: r.press, asked: sent(s, 'hr_boss_call_view').length - asked, page: r.page }));
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

const MUTANTS = [
  { name: 'a free quote is no quote (the P2)', file: 'src/session/boss-quote.js', from: '!Number.isSafeInteger(q.price) || q.price < 0) return null;', to: '!Number.isSafeInteger(q.price) || q.price < 1) return null;', want: /LW-FREE/ },
  { name: 'a free call is refused before it is sent (the P2)', file: 'src/session/boss-intents.js', from: '!Number.isSafeInteger(price) || price < 0) return', to: '!Number.isSafeInteger(price) || price < 1) return', want: /LW-FREE/ },
  { name: 'the plate takes room with nothing on', file: 'src/shell/widgets/event-plate.js', from: "cls(el, 'is-quiet', !lines.length);", to: "cls(el, 'is-quiet', false);", want: /LW-OFF/ },
  { name: 'the percent is the data\'s, not the server\'s', file: 'src/shell/live-events-view.js', from: "const vars = Object.assign({ pct: String(pctOf(x.e.pm)),", to: "const vars = Object.assign({ pct: String(pctOf(LIVE_EVENTS[x.e.id].pm)),", want: /LW-PLAY/ },
  { name: 'an event not on yet reads as on', file: 'src/shell/live-events-view.js', from: "return e.startsMs - now <= LIVE_EVENT_SHOWN.soonMs ? 'soon' : 'later';", to: "return e.startsMs - now <= LIVE_EVENT_SHOWN.soonMs ? 'on' : 'later';", want: /LW-CLOCK/ },
  { name: 'a closed window stays until the next envelope', file: 'src/shell/live-events-view.js', from: '  if (now >= e.endsMs) return null;\n', to: '', want: /LW-CLOCK/ },
  { name: 'a world XP event writes on every Hunts line', file: 'src/shell/live-events-view.js', from: "else if (x.e.dial === 'xpPm' && x.e.scope.includes(hunt))", to: "else if (x.e.dial === 'xpPm' && reaches(x.e, hunt))", want: /LW-PLAY/ },
  { name: 'a fee dial that isn\'t 0 reads free', file: 'src/shell/live-events-view.js', from: "const freeCall = (x, call) => x.e.dial === 'feePm' && x.e.pm === 0 && !!call", to: "const freeCall = (x, call) => x.e.dial === 'feePm' && !!call", want: /LW-CLOCK/ },
  { name: 'the press keeps the fee\'s words while the event frees it', file: 'src/shell/windows/boss-call-pane.js', from: 'text(press, callWords(ev ? ev.press : BOSS_CALL_WORDS.press,', to: 'text(press, callWords(BOSS_CALL_WORDS.press,', want: /LW-PLAY/ },
  { name: 'the event\'s end never reads the quote again', file: 'src/shell/windows/boss-call-pane.js', from: " + ':' + feeKey(cs, call);", to: ';', want: /LW-CLOCK/ },
  { name: 'HUD layout lists the plate with the switches off', file: 'src/shell/hud.js', from: "hud.rows().filter(listed).map(line)", to: 'hud.rows().map(line)', want: /LW-OFF/ },
  { name: 'Settings lists the plate with the switches off', file: 'src/data/settings.js', from: '...(w.section ? { visibleWhen:', to: '...(false ? { visibleWhen:', want: /LW-OFF/ },
];

async function main() {
  if (process.argv.includes('--mutate') || process.argv.includes('--selftest')) {
    if (process.env.HR_MUTANT_CONTROL) { const f = await checks(); console.log('live-events-window --mutate: control ran the clean tree: ' + (f.join('; ') || 'green')); process.exit(0); }
    let escaped = 0;
    for (const m of MUTANTS) {
      const src = (await readFile(join(ROOT, m.file), 'utf8')).replace(/\r\n/g, '\n');
      if (src.split(m.from).length !== 2) throw new Error('anchor: ' + m.name);
      let got;
      try { got = await checks({ [m.file]: src.replace(m.from, () => m.to) }); } catch (e) { got = ['THREW ' + String(e && e.message).slice(0, 160)]; }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + String(got[0] || 'every rule held').slice(0, 130));
    }
    console.log(escaped ? `live-events-window --mutate: ${escaped} ESCAPED` : `live-events-window --mutate: ${MUTANTS.length}/${MUTANTS.length} caught`);
    process.exit(escaped ? 1 : 0);
  }
  const fails = await checks();
  for (const f of fails) console.log('FAIL  ' + f);
  console.log(fails.length ? 'live-events-window: ' + fails.length + ' FAILED' : 'live-events-window: green (switched off is invisible, an event end to end, a free call, the server\'s clock)');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
