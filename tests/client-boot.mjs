#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/client-boot.mjs — THE TWO PAGES, BOOTED IN A REAL CHROMIUM.
//
//   node tests/client-boot.mjs           the boot checks
//   node tests/client-boot.mjs --mutate  every planted defect must turn a check RED
//
// mutant-anchors: src/app/boot.js src/app/slot-offer.js src/app/world-pane.js src/net/auth.js src/world/world-boot.js src/world/prewarm.js src/render/images.js index.html
//
// The server is stubbed at the edges the client really uses: supabase-js (the
// vendored UMD is replaced by a fake whose auth keeps its session in the
// storage the client hands it, and whose channels a test can push frames
// into) and the two REST paths (/rest/v1/rpc/*, /functions/v1/hr-accrue).
// Nothing reaches the network.
//
//   N-1  hearthrise.net/ (index.html) is the static notice: the Discord link, no app
//        script, and /prototypes/hunt-sim/ still serves
//   B-1  play.html boots to the sign-in screen with zero console errors
//   B-2  sign in -> the characters screen lists the server's owned slots
//   B-3  Play -> the World pane (a canvas) and the shell mount for that character;
//        a pushed frame reaches that character's pane without an error; the World
//        downloads exactly the sheets the Common draws from (src/world/scene-sets.js),
//        never a hunting ground's (10-23: every sheet on Play, 2.32 MB)
//   B-12 A SCENE SWITCHES WHOLE: a hero in town starts hunting the Mill Cellar while
//        the one sheet the cellar adds is still on its way; the World keeps the
//        Common on screen until that sheet has arrived, then shows the cellar
//   B-13 A SHEET THAT LANDS AFTER ITS PANE IS GONE DOES NOTHING: a hero back from the
//        cellar waits on the Common's sheet, the pane is closed (Characters), the sheet
//        lands: the closed pane never wakes the hero's town presence (no walkers read)
//   B-14 THE TOWN'S SHEETS COME WITH THE ACCOUNT (perf lane 10-29: a cold Play waited 1.56 s
//        for them): none on the sign-in screen, the town's own sets on the characters screen
//        before any Play (src/world/prewarm.js), and the World never fetches one again
//   B-15 A SESSION THAT ENDS WHILE THE TOWN PREWARM RUNS STOPS IT (v0.2.71 merge; run 41045835796: 6 sheets):
//        signed out with the atlas manifests still held, the page asks for no sheet afterwards
//   B-4  a second character opens beside the first (two topics, one strip)
//   B-5  sign out -> the sign-in screen, and no copy of the session is left in
//        localStorage or sessionStorage (auth key, sb-*, the tab id, the heroes it had open)
//   B-6  a password-reset link (#type=recovery) opens the set-new-password screen
//   B-7  a 403 hr_closed answer shows the closed notice, not the game
//   B-8  a hunting character (tests/fixtures/hunt-envelope.json) mounts the hunt
//        screen's panels (top bar, party, analyzer, bottom bar) with zero console
//        errors; the rules of each panel are tests/hunt-screen.mjs
//   B-9  ONE HERO, TWO SLOTS (Tyler live 10-18: no way to create a character; ruling
//        10-17: every account starts with two): the screen names the hero and its
//        Level, the empty owned slot offers Create hero, which opens the creation
//        step (Tyler 2026-10-20: a name and four colours, the hero enters town only
//        on Confirm): nothing is sent until Enter town, then ONE hr_create_hero for
//        that slot with the typed name and the picked colours plays it. A RELOAD REOPENS
//        THE TAB'S HEROES (designer 10-30 #8: a hero picked once is never re-picked):
//        the shown hero is shown again and the other plays beside it, nothing pressed;
//        a fresh tab lists both heroes by name; once the server no longer holds the
//        shown hero a reload falls back to the characters screen
//   B-11 BUY A HERO SLOT (tracker r45; Tyler 10-17: up to five, for gold): the roster offers the
//        server's next slot at the server's price, paid from "Your gold" — ONE purse per account
//        (Tyler 10-23), so there is no payer to pick; short of gold it cannot be pressed and says
//        how much more; the purse read at the newest wallet version wins; one press sends ONE
//        hr_buy_hero_slot (slot, the acting hero, key, no price) and the button is off until the
//        answer; the roster is re-read (the new empty slot offers Create hero, the next price
//        shows); at five slots there is no offer
//   B-10 A SESSION THAT ENDS UNDER THE GAME (live 2026-10-20: a dead token sent 805 times):
//        every call answers 401 and the refresh is refused -> the sign-in screen with
//        "You were signed out. Sign in again.", no session copy left, and the dead
//        session sends no more than a handful of calls
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, UID, serve, SDK_STUB } from './_client-harness.mjs';
import { TOWN_NAME } from '../src/data/world/town/plan.js';
/* Level 10's total on the shipped curve (src/core/xp.js), never typed: the curve is data (lane/b-level-curve). */
const LEVEL_10_XP = (await import(pathToFileURL(join(ROOT, 'src/core/xp.js')).href)).charXpForLevel(10);

/* account.max_concurrent is the server's concurrent limit (AccountSession.limit): without it one character plays. */
function envelope(slot, version, extra) {
  return Object.assign({ ok: true, version, now: '2026-10-17T00:00:00Z', state: { active_kind: 'idle', gold: 0 }, skills: {}, inventory: {}, hero_slots: [0, 1], account: { max_concurrent: 4 } }, extra || {});
}

const HUNT = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/hunt-envelope.json'), 'utf8'));

/* The sheets a scene draws from, as the client derives them (src/world/scene-sets.js over the shipped manifests). */
async function sheetsOf(mapId) {
  const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
  const [{ ATLAS_SETS }, { WORLD_MAPS }, bookm, mapc, ter, ss] = await Promise.all(['src/data/world/atlas-sets.js', 'src/data/world/maps/index.js',
    'src/world/core/book.js', 'src/world/core/map-compile.js', 'src/data/world/terrain.js', 'src/world/scene-sets.js'].map(imp));
  const manifests = {};
  for (const s of ATLAS_SETS) manifests[s] = JSON.parse(await readFile(join(ROOT, 'assets/world/atlas-' + s + '.json'), 'utf8'));
  const book = bookm.createBook(manifests);
  const tables = { materials: ter.MATERIALS, sprites: new Proxy(book.sprites, { get: (t, k) => t[k] || bookm.STUB_SPRITE }), openClasses: ter.OPEN_CLASSES, lights: ter.LIGHTS };
  const row = WORLD_MAPS.find((m) => m.id === mapId);
  return { sets: ss.sceneSets(mapc.compileMap(row, tables), row, book, tables), all: ATLAS_SETS };
}
const TOWN_SHEETS = await sheetsOf('town_common');
const CELLAR_SHEETS = await sheetsOf('mill_cellar');
const sheetOf = (url) => (/\/assets\/world\/atlas-([a-z0-9_]+)\.png/.exec(url) || [])[1] || null;

async function stubServer(page, o) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const url = r.request().url();
    const body = JSON.parse(r.request().postData() || '{}');
    if (o.revoked) { o.dead++; return r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'UNAUTHORIZED_ASYMMETRIC_JWT' }) }); }
    if (o.closed) return r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 'hr_closed', message: 'closed' }) });
    if (o.heroes) {   // a stateful account: { slot: name } heroes; hr_create_hero adds one, named
      const name = url.split('?')[0].split('/').pop();
      if (name === 'hr_create_hero') {
        o.created.push({ slot: body.p_slot, name: body.p_name, colors: body.p_colors });
        o.heroes[body.p_slot] = body.p_name;
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, slot: body.p_slot, name: body.p_name, created: true }) });
      }
      if (name === 'hr_buy_hero_slot') {   // B-11: the purchase, slow enough to see the button off
        o.bought.push(body);
        await new Promise((res) => setTimeout(res, 500));
        o.purse -= o.ladder[body.p_slot_id]; o.goldV++;
        o.slots.push(body.p_slot_id);
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, slot_id: body.p_slot_id, hero_slots: o.slots }) });
      }
      const slot = name === 'hr_load' ? body.p_slot : body.slot;
      const slots = o.slots || [0, 1];
      const next = o.ladder ? Object.keys(o.ladder).map(Number).find((k) => !slots.includes(k)) : undefined;
      const account = Object.assign({ max_concurrent: 4 }, o.ladder ? { hero_slots_max: 5, hero_slot_offer: next === undefined ? null : { slot_id: next, cost_gold: o.ladder[next] } } : {});
      if (name === 'hr_load' || name === 'hr-accrue') {
        const b = o.heroes[slot] ? envelope(slot, 1, { name: o.heroes[slot], hero_slots: slots, account,
          /* THE ACCOUNT PURSE (one per account): every hero states it; a lagging hero states an older version. */
          state: { active_kind: 'idle', gold: o.purse !== undefined ? (o.lag && o.lag[slot] ? o.lag[slot].gold : o.purse) : 0,
            gold_v: o.purse !== undefined ? (o.lag && o.lag[slot] ? o.lag[slot].v : o.goldV) : 0, level_xp: LEVEL_10_XP },
          /* B-9h: a hero the server holds in an open hunt ({ slot: hunt id }) */
          ...(o.hunting && o.hunting[slot] ? { hunt: { session_id: '5d1c0f2e-0000-4000-8000-00000000000' + slot, hunt_id: o.hunting[slot], ended: false } } : {}) })
          : { ok: false, error: 'no_character', hero_slots: slots };
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify(name === 'hr-accrue' ? Object.assign({ accrued: true }, b) : b) });
      }
    }
    if (url.endsWith('/rpc/hr_load')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify(o.hunt ? Object.assign({}, HUNT, { version: 1 }) : envelope(body.p_slot, 1)) });
    if (url.split('?')[0].endsWith('/functions/v1/hr-accrue')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify(Object.assign({ accrued: true }, o.hunt ? Object.assign({}, HUNT, { version: 2 }) : envelope(body.slot, 2))) });
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
}

const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

async function checks(overrides) {
  const fails = [];
  const { server, port } = await serve(overrides);
  const base = 'http://127.0.0.1:' + port;
  const browser = await leaseBrowser(chromium);
  try {
    const fresh = async (o = {}) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      await stubServer(page, o);
      return { ctx, page, errors };
    };

    { // N-1
      const { ctx, page, errors } = await fresh();
      await page.goto(base + '/', { waitUntil: 'load' });
      const n = await page.evaluate(() => ({ link: !!document.querySelector('a[href="https://discord.gg/eJrUSUJM3M"]'),
        text: document.body.innerText, scripts: Array.from(document.scripts).map((s) => s.getAttribute('src')) }));
      if (!n.link || !/Discord gets the [a-z ]*date first/i.test(n.text)) fails.push('N-1 the notice page lost its copy or Discord link');
      if (n.scripts.some((s) => !/^src\/platform\/(https-upgrade|sw-killswitch)\.js\?v=\d[\d.]*$/.test(String(s)))) fails.push('N-1 the notice page loads an app script: ' + n.scripts.join(', '));
      const hs = await page.request.get(base + '/prototypes/hunt-sim/');
      if (hs.status() !== 200) fails.push('N-1 /prototypes/hunt-sim/ answered ' + hs.status());
      if (errors.length) fails.push('N-1 console errors: ' + errors.join(' | '));
      await ctx.close();
    }

    { // B-1 .. B-5
      const { ctx, page, errors } = await fresh();
      const sheets = new Set(), asks = new Map();
      page.on('request', (q) => { const s = sheetOf(q.url()); if (s) { sheets.add(s); asks.set(s, (asks.get(s) || 0) + 1); } });
      /* every image the page points at a sheet (an image cache hit makes no request, so the network alone cannot tell
         a held sheet from one loaded again): render/images.js loads each sheet once per page */
      await page.addInitScript(() => {
        const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
        const loads = window.__sheetLoads = {};
        Object.defineProperty(HTMLImageElement.prototype, 'src', { configurable: true, get() { return d.get.call(this); },
          set(v) { const m = /\/assets\/world\/atlas-([a-z0-9_]+)\.png/.exec(String(v)); if (m) loads[m[1]] = (loads[m[1]] || 0) + 1; d.set.call(this, v); } });
      });
      await page.goto(base + '/play.html', { waitUntil: 'load' });
      if (!(await wait(page, () => document.querySelector('form[data-auth="sign-in"]')))) fails.push('B-1 no sign-in screen');
      const atSignIn = [...sheets].sort().join();
      await page.fill('input[name=email]', 'qa@example.test');
      await page.fill('input[name=password]', 'not-a-real-password');
      await page.click('.auth-submit');
      if (!(await wait(page, () => document.querySelectorAll('[data-app="play"]').length === 2))) fails.push('B-2 the characters screen did not list the two owned slots');
      /* B-14 (perf lane 10-29): the town's sheets are asked for on the characters screen, before any Play (src/world/prewarm.js) */
      for (let i = 0; i < 300 && sheets.size < TOWN_SHEETS.sets.length; i++) await page.waitForTimeout(50);   // a loaded runner: up to 15 s
      const beforePlay = [...sheets].sort().join();
      if (atSignIn) fails.push('B-14 the sign-in screen already asked for the sheets ' + atSignIn + ' (only an account fetches art)');
      if (beforePlay !== TOWN_SHEETS.sets.join()) fails.push('B-14 on the characters screen the page had asked for the sheets "' + beforePlay + '", not the town\'s ' + TOWN_SHEETS.sets.join() + ' (src/world/prewarm.js)');
      await page.click('[data-app="play"][data-slot="0"]');
      if (!(await wait(page, () => document.querySelector('#panel-world[data-slot="0"] .world-stage canvas') && document.querySelector('.hs-shell')))) fails.push('B-3 the World pane or the shell did not mount');
      const pushed = await page.evaluate((uid) => { const t = 'hr:' + uid + ':0'; const c = window.__hub.channels[t];
        if (!c) return 'no topic ' + t;
        return c.events && c.events.frame && c.status ? 'ok' : 'topic ' + t + ' has no frame handler or status callback'; }, UID);
      if (pushed !== 'ok') fails.push('B-3 ' + pushed);
      await page.waitForTimeout(300);
      const got = [...sheets].sort().join(), want = TOWN_SHEETS.sets.join();
      if (got !== want || TOWN_SHEETS.sets.length >= TOWN_SHEETS.all.length) fails.push('B-3 in the Common the World downloaded the sheets ' + got + ' (it draws from ' + want + ' of ' + TOWN_SHEETS.all.length + ')');
      const twice = [...asks].filter(([, n]) => n > 1).map(([s, n]) => s + ' x' + n);
      if (twice.length) fails.push('B-14 a sheet asked for before Play was fetched again by the World: ' + twice.join(', '));
      const loads = await page.evaluate(() => window.__sheetLoads || {});
      const again = Object.entries(loads).filter(([, n]) => n > 1).map(([k, n]) => k + ' x' + n);
      if (again.length) fails.push('B-14 a sheet the prewarm loaded was loaded again by the World (an image per load, not the held one): ' + again.join(', '));
      await page.click('[data-app="characters"]');
      if (!(await wait(page, () => document.querySelector('[data-app="play"][data-slot="1"]')))) fails.push('B-4 no way back to the characters screen');
      else {
        await page.click('[data-app="play"][data-slot="1"]');
        const two = await wait(page, (uid) => document.querySelectorAll('.char-tab[data-app="show"]').length === 2
          && window.__hub.channels['hr:' + uid + ':0'] && window.__hub.channels['hr:' + uid + ':1']
          && document.querySelector('#panel-world[data-slot="1"]'), UID);
        if (!two) fails.push('B-4 a second character did not open beside the first');
        /* B-4 ON A PHONE EACH HERO HAS A TAB YOU CAN PRESS (first-hour play 2026-10-31: at 922x423 the tools and the icon row
           left each tab 12 px; no hero could be seen or switched to, and Invite to party starts on that tab). */
        await page.setViewportSize({ width: 922, height: 423 });
        const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('.char-tab[data-app="show"]')).map((b) => Math.round(b.getBoundingClientRect().width)));
        await page.setViewportSize({ width: 1280, height: 720 });
        if (tabs.length !== 2 || tabs.some((w) => w < 44)) fails.push('B-4 on a 922x423 phone the hero tabs are ' + tabs.join(' and ') + ' px wide, too narrow to press');
      }
      await page.click('[data-app="sign-out"]');
      if (!(await wait(page, () => document.querySelector('form[data-auth="sign-in"]')))) fails.push('B-5 sign-out did not return to sign-in');
      const left = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)]
        .filter((k) => k === 'hr-auth' || k.startsWith('hr-auth-') || k.startsWith('sb-') || k === 'hr-tab-id' || k === 'hr-open' || k === 'hearthrise:supabaseSession'));
      if (left.length) fails.push('B-5 session copies left after sign-out: ' + left.join(', '));
      const topics = await page.evaluate(() => Object.keys(window.__hub.channels));
      if (topics.length) fails.push('B-5 character topics still joined after sign-out: ' + topics.join(', '));
      if (errors.length) fails.push('B-1..5 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // B-6
      const { ctx, page } = await fresh();
      await page.goto(base + '/play.html#access_token=x&type=recovery', { waitUntil: 'load' });
      if (!(await wait(page, () => document.querySelector('form[data-auth="set-password"]')))) fails.push('B-6 a reset link did not open the set-new-password screen');
      await ctx.close();
    }

    { // B-8
      const { ctx, page, errors } = await fresh({ hunt: true });
      await page.goto(base + '/play.html', { waitUntil: 'load' });
      await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
      await page.fill('input[name=email]', 'qa@example.test');
      await page.fill('input[name=password]', 'not-a-real-password');
      await page.click('.auth-submit');
      await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
      await page.click('[data-app="play"][data-slot="0"]');
      const ids = ['hunt-topbar', 'party', 'analyzer', 'action-bar'];
      const up = await wait(page, (w) => w.every((id) => document.querySelector('[data-hs-widget="' + id + '"] .hh-panel, [data-hs-widget="' + id + '"] .ht-bar, [data-hs-widget="' + id + '"] .hb-bar')), ids);
      if (!up) fails.push('B-8 the hunt panels did not mount for a hunting character');
      else if (!(await wait(page, () => document.querySelectorAll('.hp-m').length === 2))) fails.push('B-8 the party board did not list the two heroes the server sent');
      await page.waitForTimeout(400);
      if (errors.length) fails.push('B-8 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // B-12 a scene switches whole: the cellar shows only once the sheet it adds to the Common's has arrived
      const o = {};
      const { ctx, page, errors } = await fresh(o);
      const added = CELLAR_SHEETS.sets.filter((s) => !TOWN_SHEETS.sets.includes(s));
      let release = null, asked = 0;
      const held = new Promise((r) => { release = r; });
      await page.route('**/assets/world/atlas-*.png*', async (r) => {
        if (added.includes(sheetOf(r.request().url()))) { asked++; await held; }
        return r.continue();
      });
      const title = () => page.evaluate(() => (document.querySelector('#panel-world .world-title') || {}).textContent || '');
      await page.goto(base + '/play.html', { waitUntil: 'load' });
      await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
      await page.fill('input[name=email]', 'qa@example.test');
      await page.fill('input[name=password]', 'not-a-real-password');
      await page.click('.auth-submit');
      await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
      await page.click('[data-app="play"][data-slot="0"]');
      const inTown = await wait(page, (name) => ((document.querySelector('#panel-world .world-title') || {}).textContent || '').includes(name), TOWN_NAME);
      o.hunt = true;
      await page.evaluate(([uid, env]) => window.__hub.send('hr:' + uid + ':0', { t: 'state', frame: 10, env }, 'frame'), [UID, Object.assign({}, HUNT, { version: 10 })]);
      for (let i = 0; i < 60 && !asked; i++) await page.waitForTimeout(50);
      await page.waitForTimeout(500);
      const during = await title();
      release();
      const after = await wait(page, () => /Mill Cellar/.test((document.querySelector('#panel-world .world-title') || {}).textContent || ''));
      if (!added.length) fails.push('B-12 harness: the cellar adds no sheet to the Common\'s (' + CELLAR_SHEETS.sets.join() + ')');
      else if (!inTown) fails.push('B-12 the hero never stood in the Common');
      else if (!asked) fails.push('B-12 the hunt in the cellar never asked for its sheet ' + added.join());
      else if (!during.includes(TOWN_NAME)) fails.push('B-12 the World showed "' + during + '" while the cellar\'s sheet (' + added.join() + ') was still on its way');
      else if (!after) fails.push('B-12 the cellar never showed after its sheet arrived (title: ' + await title() + ')');
      if (errors.length) fails.push('B-12 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // B-13 a sheet that lands after its pane was closed draws nothing and wakes no presence
      const o = { hunt: true };
      const { ctx, page, errors } = await fresh(o);
      let release = null, asked = 0;
      const held = new Promise((r) => { release = r; });
      const back = TOWN_SHEETS.sets.filter((s) => !CELLAR_SHEETS.sets.includes(s));
      await page.route('**/assets/world/atlas-*.png*', async (r) => {
        if (back.includes(sheetOf(r.request().url()))) { asked++; await held; }
        return r.continue();
      });
      const town = [];
      page.on('request', (q) => { if (/\/rpc\/hr_town_view/.test(q.url())) town.push(Date.now()); });
      await page.goto(base + '/play.html', { waitUntil: 'load' });
      await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
      await page.fill('input[name=email]', 'qa@example.test');
      await page.fill('input[name=password]', 'not-a-real-password');
      await page.click('.auth-submit');
      await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
      await page.click('[data-app="play"][data-slot="0"]');
      const inCellar = await wait(page, () => /Mill Cellar/.test((document.querySelector('#panel-world .world-title') || {}).textContent || ''));
      o.hunt = false;
      await page.evaluate(([uid, env]) => window.__hub.send('hr:' + uid + ':0', { t: 'state', frame: 20, env }, 'frame'), [UID, envelope(0, 20)]);
      for (let i = 0; i < 60 && !asked; i++) await page.waitForTimeout(50);
      await page.click('[data-app="characters"]');
      await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
      await page.waitForTimeout(300);
      const mark = Date.now();
      release();
      await page.waitForTimeout(2000);
      const woke = town.filter((t) => t >= mark).length;
      if (!back.length) fails.push('B-13 harness: the Common adds no sheet to the cellar\'s (' + TOWN_SHEETS.sets.join() + ')');
      else if (!inCellar || !asked) fails.push('B-13 harness: the hero never hunted the cellar (' + inCellar + ') or the Common\'s sheet was never asked for (' + asked + ')');
      else if (woke) fails.push('B-13 a sheet landing after its pane was closed read the town\'s walkers ' + woke + ' time(s): the closed pane woke the presence');
      if (errors.length) fails.push('B-13 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // B-9h THE PICKER SAYS WHO IS HUNTING (core-loop play 2026-10-30; board 10-28 P3): a hero mid-hunt reads where;
      // one idle in town reads its name and Level only
      const o = { heroes: { 0: 'Tester', 1: 'Runner' }, hunting: { 1: 'mill_cellar' }, created: [] };
      const { ctx, page } = await fresh(o);
      await page.goto(base + '/play.html', { waitUntil: 'load' });
      await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
      await page.fill('input[name=email]', 'qa@example.test');
      await page.fill('input[name=password]', 'not-a-real-password');
      await page.click('.auth-submit');
      await wait(page, () => document.querySelector('[data-app="play"][data-slot="1"]'));
      const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.char-row')).map((li) => li.textContent.replace(/\s+/g, ' ').trim()));
      if (rows.length !== 2 || !/^Tester Level 10 ?Play$/.test(rows[0]) || !/^Runner Level 10 · Hunting in Mill Cellar ?Play$/.test(rows[1]))
        fails.push('B-9h the picker does not say which hero is hunting: ' + JSON.stringify(rows));
      await ctx.close();
    }

    { // B-9 one hero, two owned slots: name + level, Create hero (name + colours), both after a reload
      const o = { heroes: { 0: 'Tester' }, created: [] };
      const { ctx, page, errors } = await fresh(o);
      await page.goto(base + '/play.html', { waitUntil: 'load' });
      await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
      await page.fill('input[name=email]', 'qa@example.test');
      await page.fill('input[name=password]', 'not-a-real-password');
      await page.click('.auth-submit');
      await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
      const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.char-row')).map((li) => li.textContent.replace(/\s+/g, ' ').trim()));
      if (rows.length !== 2 || !/^Tester Level 10 ?Play$/.test(rows[0]) || !/Create hero$/.test(rows[1]) || !(await page.$('[data-app="create"][data-slot="1"]')))
        fails.push('B-9 one hero and an empty owned slot list as ' + JSON.stringify(rows));
      else {
        await page.click('[data-app="create"][data-slot="1"]');
        /* The creation step: a name, four colour rows and a preview; nothing is sent before Enter town. */
        const step = await wait(page, () => document.querySelector('.hero-name') && document.querySelectorAll('.hero-region').length === 4 && document.querySelector('.hero-preview'));
        if (!step) fails.push('B-9 Create did not open the creation step (sent ' + JSON.stringify(o.created) + ')');
        else {
          /* On a 922x423 phone the five ways to fight show too (playtest 2026-10-29: the phone hid them), in a column
             that scrolls, and Enter town still fits the screen. */
          await page.setViewportSize({ width: 922, height: 423 });
          const phone = await page.evaluate(() => { const l = document.querySelector('.hero-how-list'), b = document.querySelector('.hero-confirm');
            return { list: !!l && l.getClientRects().length > 0, fits: !!b && b.getBoundingClientRect().bottom <= innerHeight }; });
          if (!phone.list || !phone.fits) fails.push('B-9 on a 922x423 phone How you fight lists its styles: ' + phone.list + '; Enter town fits: ' + phone.fits);
          await page.setViewportSize({ width: 1280, height: 720 });
          await page.click('.hero-dye[data-hero-region="body"][data-hero-dye="6"]');
          await page.click('.hero-confirm');
          const short = await page.evaluate(() => document.querySelector('.auth-message').textContent);
          if (o.created.length || !/3 letters/.test(short)) fails.push('B-9 the creation step sent ' + JSON.stringify(o.created) + ' / said "' + short + '" for an empty name');
          await page.fill('.hero-name', 'Fennick');
          await page.click('.hero-confirm');
        }
        const played = await wait(page, () => document.querySelector('#panel-world[data-slot="1"]'));
        const c = o.created[0];
        if (o.created.length !== 1 || c.slot !== 1 || c.name !== 'Fennick' || !c.colors || c.colors.body !== 6 || Object.keys(c.colors).join() !== 'head,body,legs,feet' || !played)
          fails.push('B-9 Enter town sent ' + JSON.stringify(o.created) + (played ? '' : ' and did not play the new hero'));
        /* The reload: Fennick is shown again and Tester plays beside it, with no characters screen and no press. */
        const named = () => Array.from(document.querySelectorAll('.char-tab[data-app="show"] .char-tab-name')).map((n) => n.textContent).join() === 'Tester,Fennick';
        await wait(page, named);
        await page.reload({ waitUntil: 'load' });
        const back = await wait(page, () => document.querySelector('#panel-world[data-slot="1"]') && Array.from(document.querySelectorAll('.char-tab[data-app="show"] .char-tab-name')).map((n) => n.textContent).join() === 'Tester,Fennick');
        if (!back || await page.$('.char-list')) fails.push('B-9 a reload did not reopen the tab\'s two heroes on Fennick: '
          + JSON.stringify(await page.evaluate(() => ({ shown: (document.querySelector('#panel-world') || { dataset: {} }).dataset.slot,
            tabs: Array.from(document.querySelectorAll('.char-tab[data-app="show"]')).map((t) => t.textContent.replace(/\s+/g, ' ').trim()), list: !!document.querySelector('.char-list') }))));
        /* A fresh tab (its own tab store) starts at the characters screen, both heroes by name. */
        const tab = await ctx.newPage();
        await stubServer(tab, o);
        await tab.goto(base + '/play.html', { waitUntil: 'load' });
        await wait(tab, () => document.querySelectorAll('[data-app="play"]').length === 2);
        const after = await tab.evaluate(() => Array.from(document.querySelectorAll('.char-row .char-name')).map((n) => n.textContent.replace(/\s+/g, ' ').trim()));
        if (after.length !== 2 || !/^Tester/.test(after[0]) || !/^Fennick/.test(after[1])) fails.push('B-9 a fresh tab lists the heroes as ' + JSON.stringify(after));
        await tab.close();
        /* The server no longer holds Fennick: the reload falls back to the characters screen. */
        delete o.heroes[1];
        await page.reload({ waitUntil: 'load' });
        const safe = await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]') && document.querySelector('[data-app="create"][data-slot="1"]'));
        if (!safe || await page.$('#panel-world')) fails.push('B-9 a reload whose shown hero the server no longer holds did not fall back to the characters screen');
      }
      if (errors.length) fails.push('B-9 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // B-11 buy a hero slot with the account's gold, at the server's price; none at the cap
      const o = { heroes: { 0: 'Tester', 1: 'Fennick' }, created: [], bought: [], slots: [0, 1], purse: 14100, goldV: 7,
        lag: { 1: { gold: 90000, v: 3 } }, ladder: { 2: 15000, 3: 40000, 4: 120000 } };
      const { ctx, page, errors } = await fresh(o);
      await page.goto(base + '/play.html', { waitUntil: 'load' });
      await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
      await page.fill('input[name=email]', 'qa@example.test');
      await page.fill('input[name=password]', 'not-a-real-password');
      await page.click('.auth-submit');
      const shown = await wait(page, () => document.querySelector('[data-app="buy-slot"]'));
      const btn = () => page.evaluate(() => { const b = document.querySelector('[data-app="buy-slot"]');
        return b ? { text: b.textContent.trim(), off: b.disabled, pay: b.getAttribute('data-pay'), short: (document.querySelector('.slot-offer-short') || {}).textContent || '',
          purse: (document.querySelector('.slot-offer-purse') || {}).textContent || '', picker: !!document.querySelector('select') } : null; });
      const b0 = shown ? await btn() : null;
      /* 14,100 at wallet version 7 is the purse; Fennick's older answer (90,000 at version 3) is not. */
      if (!b0 || b0.text !== 'Buy a hero slot — 15,000 gold' || !b0.off || b0.pay !== '0' || b0.picker
        || b0.purse !== 'Your gold: 14,100' || !/^You need 900 more gold./.test(b0.short)) fails.push('B-11 the offer short of gold reads ' + JSON.stringify(b0) + ' (expected Your gold: 14,100, 900 short, off, no payer to pick)');
      else {
        o.purse = 80000; o.goldV = 8; o.lag = null;
        await page.reload({ waitUntil: 'load' });
        await wait(page, () => document.querySelector('[data-app="buy-slot"]') && !document.querySelector('[data-app="buy-slot"]').disabled);
        const b1 = await btn();
        if (!b1 || b1.off || b1.pay !== '0' || b1.short || b1.purse !== 'Your gold: 80,000') fails.push('B-11 the offer with gold reads ' + JSON.stringify(b1));
        await page.click('[data-app="buy-slot"]');
        const b2 = await btn();
        if (!b2 || !b2.off || b2.text !== 'Buying…') fails.push('B-11 while the purchase is out the button reads ' + JSON.stringify(b2));
        const reread = await wait(page, () => document.querySelectorAll('.char-row').length === 3 && document.querySelector('[data-app="create"][data-slot="2"]'));
        const sent = o.bought[0] || {};
        if (o.bought.length !== 1 || sent.p_slot_id !== 2 || sent.p_slot !== 0 || typeof sent.p_idem !== 'string' || Object.keys(sent).some((k) => /price|cost|gold/.test(k)))
          fails.push('B-11 the press sent ' + JSON.stringify(o.bought));
        const b3 = await btn();
        if (!reread || !b3 || b3.text !== 'Buy a hero slot — 40,000 gold') fails.push('B-11 after the purchase the roster reads ' + JSON.stringify(b3) + (reread ? '' : ' with no new empty slot'));
        o.slots.push(3, 4);
        await page.reload({ waitUntil: 'load' });
        await wait(page, () => document.querySelectorAll('.char-row').length === 5);
        if ((await page.$$('.char-row')).length !== 5 || await page.$('[data-app="buy-slot"]')) fails.push('B-11 at five slots the roster still offers a slot, or does not list five');
      }
      if (errors.length) fails.push('B-11 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // B-10 a refused refresh lands on sign-in, once, with no retry loop
      const o = { revoked: false, dead: 0 };
      const { ctx, page } = await fresh(o);
      await page.goto(base + '/play.html', { waitUntil: 'load' });
      await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
      await page.fill('input[name=email]', 'qa@example.test');
      await page.fill('input[name=password]', 'not-a-real-password');
      await page.click('.auth-submit');
      await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
      await page.click('[data-app="play"][data-slot="0"]');
      await wait(page, () => document.querySelector('#panel-world[data-slot="0"]'));
      await page.waitForTimeout(300);
      o.revoked = true;
      /* a re-join of the push topic makes the character ask the engine (one hello per join; a frame never does) */
      await page.evaluate((uid) => { window.__refuseRefresh = true; window.__hub.join('hr:' + uid + ':0'); }, UID);
      const out = await wait(page, () => document.querySelector('form[data-auth="sign-in"]') && /You were signed out\. Sign in again\./.test(document.body.innerText));
      if (!out) fails.push('B-10 a refused refresh did not land on sign-in with "You were signed out. Sign in again."');
      await page.waitForTimeout(1500);
      if (o.dead > 3) fails.push('B-10 the dead session sent ' + o.dead + ' calls');
      const left = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((k) => k === 'hr-auth' || k === 'hr-tab-id'));
      if (out && left.length) fails.push('B-10 session copies left after the session ended: ' + left.join(', '));
      await ctx.close();
    }

    { // B-15 a session that ends while the town prewarm runs stops it: no sheet is asked for a dead account
      const { ctx, page } = await fresh({});
      let release = null, held = 0;
      const gate = new Promise((r) => { release = r; });
      const sheets = [];
      let outAt = Infinity;
      page.on('request', (q) => { if (sheetOf(q.url())) sheets.push([Date.now(), sheetOf(q.url())]); });
      await page.route('**/assets/world/atlas-*.json*', async (r) => { held++; await gate; return r.continue(); });
      await page.goto(base + '/play.html', { waitUntil: 'load' });
      await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
      await page.fill('input[name=email]', 'qa@example.test');
      await page.fill('input[name=password]', 'not-a-real-password');
      await page.click('.auth-submit');
      await wait(page, () => document.querySelector('[data-app="sign-out"]') && document.querySelector('[data-app="play"]'));
      for (let i = 0; i < 100 && !held; i++) await page.waitForTimeout(50);
      outAt = Date.now();
      await page.click('[data-app="sign-out"]');
      await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
      release();
      await page.waitForTimeout(1500);
      if (!held) fails.push('B-15 harness: the town prewarm never asked for the atlas manifests');
      const early = sheets.filter(([t]) => t < outAt).map(([, n]) => n), late = sheets.filter(([t]) => t >= outAt).map(([, n]) => n);
      if (held && early.length) fails.push('B-15 harness: ' + early.length + ' sheet(s) were asked for before the sign-out with the manifests held (' + held + ' held): ' + early.join(', '));
      if (held && late.length) fails.push('B-15 the prewarm of a signed-out account asked for ' + late.length + ' sheet(s): ' + late.join(', '));
      await ctx.close();
    }

    { // B-7
      const { ctx, page } = await fresh({ closed: true });
      await page.goto(base + '/play.html', { waitUntil: 'load' });
      await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
      await page.fill('input[name=email]', 'qa@example.test');
      await page.fill('input[name=password]', 'not-a-real-password');
      await page.click('.auth-submit');
      if (!(await wait(page, () => /a new game in development. Follow Discord for the first playtest/i.test(document.body.innerText)))) fails.push('B-7 the closed answer did not show the closed notice');
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

const MUTANTS = [
  ['no hero slot is offered', 'src/app/slot-offer.js', "  if (!offer || !purse || actor === null) return '';", "  return '';"],
  ['the oldest hero answer is the purse', 'src/app/slot-offer.js', '    if (!best || v > best.v) best = { gold: r.gold, v };', '    if (!best || v < best.v) best = { gold: r.gold, v };'],
  ['the buy button stays lit while buying', 'src/app/slot-offer.js', "(o.pending || short > 0 ? ' disabled' : '')", "(short > 0 ? ' disabled' : '')"],
  ['a hero short of gold can press buy', 'src/app/slot-offer.js', "(o.pending || short > 0 ? ' disabled' : '')", "(o.pending ? ' disabled' : '')"],
  ['a bought slot is not re-read', 'src/app/boot.js', "if (r.ok) { track('hero_slot_bought'); await showCharacters(", "if (r.ok) { track('hero_slot_bought'); drawSlotOffer(); void ("],
  ['the notice page boots the app', 'index.html', '</body>', '<script type="module" src="src/app/boot.js?v=1"></script></body>'],
  ['sign-out leaves the session copies', 'src/net/auth.js', '      for (const k of store.keys()) if (k === cfg.authKey', '      for (const k of []) if (k === cfg.authKey'],
  ['the world pane never mounts the shell', 'src/app/world-pane.js', "  shell = mountShell(stage, {", "  shell = { onInset: () => () => {}, paint() {}, destroy() {} }; void ({"],
  ['the recovery link is ignored', 'src/app/boot.js', [["if (ev === 'recovery') showAuth('set-password');", "if (ev === 'nothing') showAuth('set-password');"],
    ['const recovering = /type=recovery/.test(win.location.hash);', 'const recovering = false;']]],
  ['the hunt panels never mount', 'src/data/hud-widgets.js', 'min: Object.freeze([320, 64]), opacity: 1, visible: true', 'min: Object.freeze([320, 64]), opacity: 1, visible: false'],
  ['every hero is "Character N" again', 'src/app/boot.js', "(r.exists ? esc(r.name || 'Unnamed hero')", "(r.exists ? 'Character ' + (r.slot + 1)"],
  ['an empty owned slot offers no Create', 'src/app/boot.js', `: 'data-app="create"') + ' data-slot="'`, `: 'data-app="nothing"') + ' data-slot="'`],
  ['Create skips the name and colours step', 'src/app/boot.js', "else if (what === 'create') showCreate(slot);",
    "else if (what === 'create') account.create(slot, 'New hero', { head: 13, body: 5, legs: 3, feet: 0 }).then(() => play(slot));"],
  ['a reload lands on the characters screen again (B-9)', 'src/app/boot.js', '    else if (auth.userId()) startAccount(true);', '    else if (auth.userId()) startAccount(false);'],
  ['a reload whose shown hero does not load stays on the reading screen (B-9)', 'src/app/boot.js', 'if (was && await play(was.viewed, was.slots)) return;', 'if (was) { await play(was.viewed, was.slots); return; }'],
  ['a dead session stays in the game', 'src/app/boot.js', "else if (ev === 'signed-out' || ev === 'expired') sessionEnded();", "else if (ev === 'signed-out') sessionEnded();"],
  ['the closed answer is ignored', 'src/app/boot.js', "if (why === 'closed-game') showClosed();", "if (why === 'never') showClosed();"],
  ['the town\'s sheets wait for Play again', 'src/app/boot.js', "    import('../world/prewarm.js?v=", "    Promise.resolve({ prewarmTown() {} }, '../world/prewarm.js?v="],
  ["a signed-out account's prewarm runs on (B-15)", 'src/world/prewarm.js', 'live: () => !run.stopped && alive() };', 'live: () => !run.stopped };'],
  ['the World fetches a prewarmed sheet again', 'src/render/images.js', '  let ready = HELD.get(url);\n  if (ready) return ready;', '  let ready = null;'],
  ['the World downloads every sheet on Play', 'src/world/world-boot.js', '    await sheets.ensure(await setsOf(id));',
    '    await setsOf(id);\n    await sheets.ensure(Array.from(new Set(Object.keys(book.sprites).map((sid) => book.frame(sid).set))));'],
  ['a scene shows before its sheets arrive', 'src/world/world-boot.js', "could not be prepared', e));\n      }\n      return null;",
    "could not be prepared', e));\n      }"],
  ['a closed pane still draws a sheet that lands late', 'src/world/world-boot.js', '    if (gone) return;\n    if (panel', '    if (panel'],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'client-boot: ' + fails.length + ' check(s) RED' : 'client-boot: both pages boot; sign-in, play (the Common sheets only), a scene switched whole, a late sheet on a closed pane, two characters, one hero + a named, coloured hero created in the second slot, the open heroes back after a reload, sign-out, a dead session, reset and closed all hold');
    process.exit(fails.length ? 1 : 0);
  }
  let bad = 0;
  const clean = await checks(null);
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  console.log('  ✓ clean control green');
  for (const [name, file, from, to] of MUTANTS) {
    let text = await readFile(join(ROOT, file), 'utf8');
    const pairs = Array.isArray(from) ? from : [[from, to]];
    const missing = pairs.find(([a]) => !text.includes(a));
    if (missing) { console.log('  ✗ ' + name + ' — anchor not found in ' + file); bad++; continue; }
    for (const [a, b] of pairs) text = text.replace(a, b);
    const fails = await checks({ [file]: text });
    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  console.log(bad ? 'client-boot --mutate: ' + bad + ' escaped' : 'client-boot --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}
main();
