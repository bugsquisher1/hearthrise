#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/client-boot.mjs — THE TWO PAGES, BOOTED IN A REAL CHROMIUM.
//
//   node tests/client-boot.mjs           the boot checks
//   node tests/client-boot.mjs --mutate  every planted defect must turn a check RED
//
// mutant-anchors: src/styles/app.css src/data/outfits.js src/platform/load-shell.js play.html src/app/boot.js src/app/slot-offer.js src/app/world-pane.js src/net/auth.js src/world/world-boot.js src/world/prewarm.js src/render/images.js index.html
//
// The server is stubbed at the edges the client really uses: supabase-js (the
// vendored UMD is replaced by a fake whose auth keeps its session in the
// storage the client hands it, and whose channels a test can push frames
// into) and the two REST paths (/rest/v1/rpc/*, /functions/v1/hr-accrue).
// Nothing reaches the network.
//
//   N-1  hearthrise.net/ (index.html) is the static notice: the Discord link, no app
//        script, and /prototypes/hunt-sim/ still serves
//   B-16 a slow first visit paints a loading shell (crest, line, a bar that moves) before the page's modules run; the first
//        screen takes over from it; a module that cannot load says so
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
//   B-17 "WHILE YOU WERE AWAY" IS WRITTEN ON THE WAY OUT (beta cost 11-01: a put a minute per hero): a hunt on screen with a young
//        stamp writes nothing; hiding the page writes every open hero's stamp once, on a fetch that outlives the page; a page
//        flickering in and out of view writes no more; a page closed with no hide event (pagehide alone) still gets it out;
//        a hunt this page has not stamped yet is stamped at once, so a tab killed with no goodbye still has an answer
//   B-18 RESIDUE IN THE DEBOUNCE SURVIVES A RELOAD (coach's Got it, lost for 1.5 s after every press): Got it, reload at once, over a real
//        server (a real page's way out; Playwright's routes never see it): the server holds the read and the card stays dismissed
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
import { scopedMutants } from '../tools/lib/mutant-scope.mjs';
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
    if (o.puts && url.endsWith('/rpc/hr_put_client_state')) { o.puts.push(body); return r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); }
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
          ...(o.hunting && o.hunting[slot] ? { hunt: { session_id: '5d1c0f2e-0000-4000-8000-00000000000' + slot, hunt_id: o.hunting[slot], ended: false } } : {}),
          ...(o.stamped ? { client_state: { awaySeen: { s: '5d1c0f2e-0000-4000-8000-00000000000' + slot, at: Date.parse('2026-10-17T00:00:00Z') - 5 * 60000, xp: LEVEL_10_XP } } } : {}) })
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

/* `leaving`: run B-17 and B-18 too. Together about 20 s a run: --mutate runs them for their own mutants and the clean control only, or
   36 mutants add 12 minutes to a 30-minute CI job (smoke.yml in-page, measured 14.2). */
async function checks(overrides, leaving = true) {
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

    { // B-16 A SLOW FIRST VISIT SEES A SHELL (old-laptop player 10-31: plain black until all 346 modules had arrived): with the page's
      // entry module held on the wire, the crest, the line and the bar are on screen and the page has painted; the bar
      // moves as modules land; the sign-in screen takes over from it. A module that cannot load says so.
      const { ctx, page, errors } = await fresh();
      let free = null;
      const held = new Promise((r) => { free = r; });
      await page.route('**/src/app/boot.js*', async (r) => { await held; return r.fallback(); });
      await page.goto(base + '/play.html', { waitUntil: 'commit' });
      const shown = await wait(page, () => { const s = document.querySelector('.boot-shell'), l = s && s.querySelector('.boot-shell-line'), i = s && s.querySelector('img');
        return s && l && /Loading Hearthrise/.test(l.textContent) && s.getBoundingClientRect().width > 0 && i && getComputedStyle(s).display !== 'none'
          && performance.getEntriesByName('first-contentful-paint').length > 0; });
      if (!shown) fails.push('B-16 with the modules still on their way nothing was painted: no crest and no "Loading Hearthrise" on screen');
      const bar = await wait(page, () => { const f = document.querySelector('.boot-shell-fill'); return f && parseFloat(f.style.width) > 0; });
      if (!bar) fails.push('B-16 the loading bar never moved as the modules landed');
      if (await page.$('form[data-auth="sign-in"]')) fails.push('B-16 the sign-in screen came before its module');
      free();
      if (!(await wait(page, () => document.querySelector('form[data-auth="sign-in"]') && !document.querySelector('.boot-shell')))) fails.push('B-16 the shell did not give way to the sign-in screen');
      if (errors.length) fails.push('B-16 console errors: ' + errors.join(' | '));
      await ctx.close();
      /* a module that cannot load says so (the wait never runs for ever) */
      const dead = await fresh();
      await dead.page.route('**/src/app/boot.js*', (r) => r.abort());
      await dead.page.goto(base + '/play.html', { waitUntil: 'commit' });
      if (!(await wait(dead.page, () => /could not finish loading/.test((document.querySelector('.boot-shell-line') || {}).textContent || '')))) fails.push('B-16 a module that could not load left the shell saying it is still loading');
      await dead.ctx.close();
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

    if (leaving) { // B-17 the away stamp goes on the way out, for every open hero
      const opened = async (stamped) => {
        const o = { heroes: { 0: 'Tester', 1: 'Runner' }, hunting: { 0: 'mill_cellar', 1: 'mill_cellar' }, created: [], puts: [], stamped };
        const f = await fresh(o);
        /* what each put asked of the browser, and a page hidden on demand (document.hidden is not ours to set in a headless page) */
        await f.page.addInitScript(() => {
          const real = window.fetch;
          window.__kept = [];
          window.fetch = (u, i) => { if (String(u).endsWith('/rpc/hr_put_client_state')) window.__kept.push(!!(i && i.keepalive)); return real(u, i); };
          let hidden = false;
          Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => hidden });
          window.__hide = (on) => { hidden = on; document.dispatchEvent(new Event('visibilitychange')); };
        });
        await f.page.goto(base + '/play.html', { waitUntil: 'load' });
        await wait(f.page, () => document.querySelector('form[data-auth="sign-in"]'));
        await f.page.fill('input[name=email]', 'qa@example.test');
        await f.page.fill('input[name=password]', 'not-a-real-password');
        await f.page.click('.auth-submit');
        await wait(f.page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
        await f.page.click('[data-app="play"][data-slot="0"]');
        await wait(f.page, () => document.querySelector('.char-tab[data-slot="1"]'));
        await f.page.waitForTimeout(2500);   // past the residue's debounce
        return Object.assign(f, { o });
      };
      const stamps = (o) => o.puts.filter((p) => p.p_patch && p.p_patch.awaySeen);
      const seen = (o) => stamps(o).map((p) => p.p_slot).sort().join();

      try {
      const a = await opened(true);
      if (stamps(a.o).length) fails.push('B-17 a hunt on screen wrote its stamp with no one leaving: ' + JSON.stringify(stamps(a.o)));
      await a.page.evaluate(() => window.__hide(true));
      await a.page.waitForTimeout(400);
      if (seen(a.o) !== '0,1') fails.push('B-17 hiding the page did not write each open hero\'s stamp: slots [' + seen(a.o) + ']');
      const kept = await a.page.evaluate(() => window.__kept);
      if (!kept.length || !kept.every(Boolean)) fails.push('B-17 the stamp was not sent on a fetch that outlives the page: ' + JSON.stringify(kept));
      for (let i = 0; i < 6; i++) { await a.page.evaluate((h) => window.__hide(h), i % 2 === 0 ? false : true); await a.page.waitForTimeout(40); }
      await a.page.waitForTimeout(2000);   // past the debounce: what a hide held back would have gone by now
      if (stamps(a.o).length !== 2) fails.push('B-17 a page flickering in and out of view wrote ' + stamps(a.o).length + ' stamps, not its first 2');
      if (a.errors.length) fails.push('B-17 console errors: ' + a.errors.slice(0, 3).join(' | '));
      await a.ctx.close();

      const b = await opened(true);
      /* closed with no visibilitychange seen (the event order a browser owes nobody): pagehide alone. The event, not a real
         navigation: Playwright's routes do not see a request still in flight from a document that has gone. */
      await b.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
      await b.page.waitForTimeout(400);
      if (seen(b.o) !== '0,1') fails.push('B-17 a page closed did not get its heroes\' stamps out: slots [' + seen(b.o) + ']');
      await b.ctx.close();

      const c = await opened(false);
      if (seen(c.o) !== '0,1') fails.push('B-17 a hunt not stamped yet was not stamped at once (a killed tab would have no answer): slots [' + seen(c.o) + ']');
      await c.ctx.close();
      } catch (e) { fails.push('B-17 threw: ' + String(e && e.message).split('\n')[0]); }   // as B-18: a red, never the end of the run
    }

    if (leaving) { // B-18 a Got it pressed just before a reload stays pressed
      /* a fresh hero in town (phone-touch PH-6): its first card, "Every weapon is a style", has a Got it in the bag */
      const fixture = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
      const residue = { coach: { read: [] } };
      let version = 1;
      const puts = [];
      const api = async (req, res) => {
        const name = (/^\/(?:rest\/v1\/rpc|functions\/v1)\/([a-z_-]+)/.exec(req.url) || [])[1];
        if (!name) return false;
        let raw = ''; for await (const c of req) raw += c;
        const body = JSON.parse(raw || '{}');
        if (name === 'hr_put_client_state') { puts.push(body.p_patch); Object.assign(residue, body.p_patch); }
        const hero = name === 'hr_load' || name === 'hr-accrue';
        const answer = hero ? Object.assign({}, fixture, { version: ++version, hunt: null, client_state: residue, state: Object.assign({}, fixture.state, { level_xp: 0, active_kind: null, active_id: null }),
          equipment: Object.assign({}, fixture.equipment, { weapon: 'practice_sword' }) }) : { ok: true };
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(name === 'hr-accrue' ? Object.assign({ accrued: true }, answer) : answer));
        return true;
      };
      const boot = await readFile(join(ROOT, 'src/net/supabase-bootstrap.js'), 'utf8');
      const here = boot.replace("url: 'https://nezapsylztqbbwuwembx.supabase.co',", 'url: globalThis.location.origin,');
      if (here === boot) fails.push('B-18 harness: the project URL in supabase-bootstrap.js moved');
      const real = await serve(Object.assign({}, overrides, { 'src/net/supabase-bootstrap.js': here }), api);
      const { ctx, page, errors } = await fresh();
      try {
        await page.goto('http://127.0.0.1:' + real.port + '/play.html', { waitUntil: 'load' });
        await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
        await page.fill('input[name=email]', 'qa@example.test');
        await page.fill('input[name=password]', 'not-a-real-password');
        await page.click('.auth-submit');
        await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
        await page.click('[data-app="play"][data-slot="0"]');
        const got = '.hs-win-coach [data-tutorial] .hs-coach-got';
        if (await wait(page, () => document.querySelector('.hs-launchers [data-hs-open="inventory"]'), null, 15000)) await page.click('.hs-launchers [data-hs-open="inventory"]');
        else fails.push('B-18 the game screen never showed its launchers');
        if (!(await wait(page, (q) => document.querySelector(q), got, 15000))) fails.push('B-18 CONTROL: a fresh hero shows no card with Got it');
        else {
          await page.waitForTimeout(2000);   // what the first paint wrote has landed: only the press is left to lose
          const card = await page.evaluate((q) => document.querySelector(q).closest('[data-tutorial]').getAttribute('data-tutorial'), got);
          const before = puts.length;
          const t0 = Date.now();
          await page.evaluate((q) => document.querySelector(q).click(), got);
          await page.reload({ waitUntil: 'commit' });
          const ms = Date.now() - t0;
          if (ms > 1200) fails.push('B-18 CONTROL: the reload began ' + ms + ' ms after the press, past the debounce: this run proves nothing');
          await wait(page, () => document.querySelector('.hs-launchers'), null, 15000);
          await page.waitForTimeout(1500);
          const read = residue.coach && residue.coach.read;
          if (!Array.isArray(read) || !read.includes(card)) fails.push('B-18 Got it on "' + card + '" just before a reload never reached the server: ' + JSON.stringify(puts.slice(before)));
          const again = await page.evaluate((id) => !!document.querySelector('[data-tutorial="' + id + '"]'), card);
          if (again) fails.push('B-18 the card "' + card + '" came back after the reload');
        }
        if (errors.length) fails.push('B-18 console errors: ' + errors.slice(0, 3).join(' | '));
      } catch (e) {   // a press that cannot land is this check's red, never the end of the run (--mutate plants a page with no game on it)
        fails.push('B-18 threw: ' + String(e && e.message).split('\n')[0]);
      } finally { await ctx.close(); real.server.close(); }
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
      /* The sign-in says what the game is, once, under the crest (newcomer panel 2026-11-01). */
      const pitch = await page.evaluate(() => { const p = document.querySelector('.auth-brand .auth-pitch'); return p && p.getClientRects().length ? p.textContent : null; });
      if (pitch !== 'Your heroes hunt, gather and craft, even while you\'re away.') fails.push('B-9 the sign-in screen pitches ' + JSON.stringify(pitch));
      /* THE PRESS MOVES ON (friends' panel 2026-11-01): off with its words while the server is out; a lost answer's retry keeps its key; once made, no press asks again. */
      const press = await page.evaluate(async () => {
        const { renderHeroCreate } = await import(location.origin + '/src/app/hero-create.js');
        const card = document.createElement('div'); document.body.append(card);
        const keys = []; let dones = 0, answer, went;
        const step = renderHeroCreate(card, { slot: 1, colorOf: () => '#000000', dyes: false, back() {},
          create: (n, c, k) => { keys.push(k); return new Promise((r) => { answer = r; }); }, done: () => { dones++; return new Promise((r) => { went = r; }); } });
        const b = card.querySelector('.hero-confirm'), tick = () => new Promise((r) => setTimeout(r, 0));
        card.querySelector('.hero-name').value = 'Fennick';
        b.click();
        const out = { working: [b.disabled, b.textContent] };
        b.click();
        out.oneAsk = keys.length === 1;
        answer({ ok: false, answered: false, reason: 'network' }); await tick();
        out.lost = [b.disabled, b.textContent];
        b.click();
        out.sameKey = keys.length === 2 && keys[0] === keys[1];
        answer({ ok: true, answered: true }); await tick();
        out.entering = [b.disabled, b.textContent, dones];
        b.click();
        out.noAsk = keys.length === 2 && dones === 1;
        went(false); await tick();
        out.stuck = [b.disabled, card.querySelector('.auth-message').textContent];
        b.click();
        out.again = keys.length === 2 && dones === 2;
        step.destroy(); card.remove();
        return out;
      });
      if (!press.working[0] || press.working[1] !== 'Making your hero…' || !press.oneAsk || press.lost[0] || press.lost[1] !== 'Enter town' || !press.sameKey
        || !press.entering[0] || press.entering[1] !== 'Entering town…' || press.entering[2] !== 1 || !press.noAsk || press.stuck[0] || !/hero is made/.test(press.stuck[1]) || !press.again) fails.push('B-9 the Enter town press: ' + JSON.stringify(press));
      /* Sign-up sent: the fields stand aside for the message and the way back (phone panel 2026-11-01: Back half off a 390 px screen). */
      const sent = await page.evaluate(async () => {
        const { renderAuthScreen } = await import(location.origin + '/src/app/sign-in.js');
        const box = document.createElement('div'); document.body.append(box);
        renderAuthScreen(box, { signUp: async () => ({ ok: true, message: 'Check your email.' }) }, 'create', {});
        const form = box.querySelector('form');
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        await new Promise((r) => setTimeout(r, 0));
        const out = { field: box.querySelector('.auth-field').getClientRects().length, submit: box.querySelector('.auth-submit').getClientRects().length, back: box.querySelector('.auth-link').getClientRects().length, said: box.querySelector('.auth-message').textContent };
        box.remove();
        return out;
      });
      if (sent.field || sent.submit || !sent.back || sent.said !== 'Check your email.') fails.push('B-9 a sign-up sent reads ' + JSON.stringify(sent));
      await page.fill('input[name=email]', 'qa@example.test');
      await page.fill('input[name=password]', 'not-a-real-password');
      await page.click('.auth-submit');
      await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
      const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.char-row')).map((li) => li.textContent.replace(/\s+/g, ' ').trim()));
      if (rows.length !== 2 || !/^Tester Level 10 ?Play$/.test(rows[0]) || !/Create hero$/.test(rows[1]) || !(await page.$('[data-app="create"][data-slot="1"]')))
        fails.push('B-9 one hero and an empty owned slot list as ' + JSON.stringify(rows));
      else {
        await page.click('[data-app="create"][data-slot="1"]');
        /* The creation step: a name and how you fight; nothing is sent before Enter town. The colors are hidden until the world draws them
           (outfits.js HERO_DYES_SHOWN, newcomer panel 2026-11-01), and Enter town shows with no scrolling at a laptop's 1366x768. */
        await page.setViewportSize({ width: 1366, height: 768 });
        const step = await wait(page, () => document.querySelector('.hero-name') && document.querySelector('.hero-how-list'));
        if (!step) fails.push('B-9 Create did not open the creation step (sent ' + JSON.stringify(o.created) + ')');
        else {
          const laptop = await page.evaluate(() => { const b = document.querySelector('.hero-confirm').getBoundingClientRect(); return { bottom: Math.round(b.bottom), H: innerHeight, doc: document.documentElement.scrollHeight, dyes: document.querySelectorAll('.hero-region, .hero-preview, .hero-note').length }; });
          if (laptop.bottom > laptop.H || laptop.doc > laptop.H || laptop.dyes) fails.push('B-9 at 1366x768 the creation step reads ' + JSON.stringify(laptop));
          /* On a 922x423 phone the five ways to fight show too (playtest 2026-10-29: the phone hid them), in a column
             that scrolls, and Enter town still fits the screen. */
          await page.setViewportSize({ width: 922, height: 423 });
          const phone = await page.evaluate(() => { const l = document.querySelector('.hero-how-list'), b = document.querySelector('.hero-confirm');
            return { list: !!l && l.getClientRects().length > 0, fits: !!b && b.getBoundingClientRect().bottom <= innerHeight }; });
          if (!phone.list || !phone.fits) fails.push('B-9 on a 922x423 phone How you fight lists its styles: ' + phone.list + '; Enter town fits: ' + phone.fits);
          /* the smallest landscape phone (667x375): nothing runs off the right edge, and the note never widens the form */
          await page.setViewportSize({ width: 667, height: 375 });
          const small = await page.evaluate(() => { const b = document.querySelector('.hero-confirm').getBoundingClientRect(), h = document.querySelector('.hero-how').getBoundingClientRect();
            return { go: Math.round(b.right), how: Math.round(h.right), doc: document.documentElement.scrollWidth, W: innerWidth }; });
          if (small.go > small.W || small.how > small.W || small.doc > small.W) fails.push('B-9 at 667x375 the creation step runs off the right edge: ' + JSON.stringify(small));
          await page.setViewportSize({ width: 1280, height: 720 });
          await page.click('.hero-confirm');
          const short = await page.evaluate(() => document.querySelector('.auth-message').textContent);
          if (o.created.length || !/3 letters/.test(short)) fails.push('B-9 the creation step sent ' + JSON.stringify(o.created) + ' / said "' + short + '" for an empty name');
          await page.fill('.hero-name', 'Fennick');
          await page.click('.hero-confirm');
        }
        const played = await wait(page, () => document.querySelector('#panel-world[data-slot="1"]'));
        const c = o.created[0];
        if (o.created.length !== 1 || c.slot !== 1 || c.name !== 'Fennick' || !c.colors || Object.keys(c.colors).join() !== 'head,body,legs,feet' || !played)
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
      /* "Up to 4" beside two slots says how the other two come, at the server's price (blind playtest 2026-10-31). */
      const lead = await page.evaluate(() => (document.querySelector('.auth-lead') || {}).textContent || '');
      if (!/You own 2 hero slots, and up to 4 heroes can play at once\. More slots cost gold: the third is 15,000\./.test(lead)) fails.push('B-11 the line over the roster reads ' + JSON.stringify(lead));
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
        /* The new slot stands empty, so no other is on sale until a hero is in it (newcomer panel 2026-11-01); the third hero brings the fourth slot's price. */
        if (!reread || b3) fails.push('B-11 after the purchase the roster reads ' + JSON.stringify(b3) + (reread ? ' beside the new empty slot' : ' with no new empty slot'));
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
  ['the loading shell stays over the first screen', 'src/app/boot.js', '    if (loading) loading.remove();\n', ''],
  ['the loading bar never moves', 'src/platform/load-shell.js', '      paint();\n', ''],
  ['a module that cannot load is not said', 'src/platform/load-shell.js', "    failed = true;\n", "    return;\n"],
  ['the page paints no loading shell', 'play.html', '<p class="boot-shell-line">Loading Hearthrise…</p>', ''],
  ['a made hero\'s press asks the server again', 'src/app/hero-create.js', "    if (made) { enter(); return; }\n", ''],
  ['Enter town comes back live under a slow town', 'src/app/hero-create.js', "    hold('Entering town…');\n", ''],
  ['a lost answer\'s retry gets a new key', 'src/app/hero-create.js', "    if (!tried || tried.name !== name) tried =", '    tried ='],
  ['a sign-up sent keeps its fields', 'src/styles/app.css', '.auth-card.is-sent .auth-field, .auth-card.is-sent .auth-submit { display: none; }\n', ''],
  ['the sign-in says nothing of the game', 'src/styles/app.css', '.auth:has(.auth-card[data-auth]) .auth-pitch { display: block; }\n', ''],
  ['Enter town runs under the fold at 1366x768', 'src/styles/app.css', '.auth:has(.auth-card.is-create) .auth-brand { display: none; }\n', ''],
  ['the color strips are back while the world draws none', 'src/data/outfits.js', 'export const HERO_DYES_SHOWN = false;', 'export const HERO_DYES_SHOWN = true;'],
  ['no hero slot is offered', 'src/app/slot-offer.js', "  if (!offer || !purse || actor === null || anEmptySlot(roster)) return '';", "  return '';"],
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
  ['the away stamp is not written on hide (B-17)', 'src/app/boot.js', 'if (alerts && doc.hidden) alerts.leaving({ hidden: true });', ''],
  ['the away stamp is not written on page leave (B-17)', 'src/app/boot.js', "win.addEventListener('pagehide', () => { if (alerts) alerts.leaving(); });", ''],
  ['the away stamp goes on a fetch the closing page cancels (B-17)', 'src/shell/alerts.js', 'cs.flushResidue({ keepalive: true, hidden })', 'cs.flushResidue({ hidden })'],
  ['only the away stamp is flushed on the way out, a pending Got it is lost to the reload (B-18)', 'src/shell/alerts.js', '{ stampAway(cs, true); cs.flushResidue({ keepalive: true, hidden }).catch(() => {}); }', '{ if (stampAway(cs, true)) cs.flushResidue({ keepalive: true, hidden }).catch(() => {}); }'],
  ['the keepalive never reaches the fetch (B-17)', 'src/session/server.js', '...(keep && body.length < KEEPALIVE_MAX_BYTES ? { keepalive: true } : {}),', ''],
  ['only the viewed hero is stamped on the way out (B-17)', 'src/shell/alerts.js', 'for (const cs of account.characters()) { stampAway(cs, true);', 'for (const cs of account.characters().slice(0, 1)) { stampAway(cs, true);'],
  ['every flicker of the page writes (B-17)', 'src/shell/away-recap.js', '(leaving ? LEAVE_EVERY_MS : STAMP_EVERY_MS)', '(leaving ? -1 : STAMP_EVERY_MS)'],
  ['the away stamp is written every minute again (B-17)', 'src/shell/away-recap.js', 'export const STAMP_EVERY_MS = AWAY_MIN_MS;', 'export const STAMP_EVERY_MS = 60000;'],
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
  /* A gated push proves only the mutants its diff touches (tools/lib/mutant-scope.mjs); the nightly proves them all. */
  const MINE = scopedMutants('tests/client-boot.mjs', MUTANTS);
  if (!MINE.length) process.exit(0);
  let bad = 0;
  const clean = await checks(null);
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  console.log('  ✓ clean control green');
  const onlyAt = process.argv.indexOf('--only');   // a name fragment: prove just those mutants (a local re-check)
  const chosen = MINE.filter((m) => onlyAt < 0 || m[0].includes(process.argv[onlyAt + 1]));
  for (const [name, file, from, to] of chosen) {
    let text = await readFile(join(ROOT, file), 'utf8');
    const pairs = Array.isArray(from) ? from : [[from, to]];
    const missing = pairs.find(([a]) => !text.includes(a));
    if (missing) { console.log('  ✗ ' + name + ' — anchor not found in ' + file); bad++; continue; }
    for (const [a, b] of pairs) text = text.replace(a, b);
    const fails = await checks({ [file]: text }, /\(B-1[78]\)/.test(name));
    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  console.log(bad ? 'client-boot --mutate: ' + bad + ' escaped' : 'client-boot --mutate: ' + chosen.length + '/' + chosen.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}
main();
