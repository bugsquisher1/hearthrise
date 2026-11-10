#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/client-boot.mjs — THE TWO PAGES, BOOTED IN A REAL CHROMIUM.
//
//   node tests/client-boot.mjs           the boot checks
//   node tests/client-boot.mjs --mutate  every planted defect must turn a check RED
//
// mutant-anchors: src/app/sign-in.js src/app/legal-reader.js src/session/server.js src/styles/app.css src/data/outfits.js src/platform/load-shell.js play.html src/app/boot.js src/app/slot-offer.js src/app/world-pane.js src/net/auth.js src/world/world-boot.js src/world/view-sheets.js src/world/atlas.js src/world/render/canvas-backend.js src/world/prewarm.js src/render/images.js index.html src/app/closed-notice.js src/session/account-session.js
//
// The server is stubbed at the edges the client really uses: supabase-js (the
// vendored UMD is replaced by a fake whose auth keeps its session in the
// storage the client hands it, and whose channels a test can push frames
// into) and the two REST paths (/rest/v1/rpc/*, /functions/v1/hr-accrue).
// Nothing reaches the network.
//
//   N-1  hearthrise.net/ (index.html) is the static notice: the Discord link, no app
//        script, one quiet way in that reaches the sign-in screen, and /prototypes/hunt-sim/ still serves
//   B-16 a slow first visit paints a loading shell (crest, line, a bar that moves) before the page's modules run; the first
//        screen takes over from it; a module that cannot load says so
//   B-19 ONE FILE NEVER DECIDES THE PAGE (live v0.2.83: float-menu.js answered 503 once and the page stopped until a reload): one 503 on a
//        file of the entry's graph, or on a preload nothing else imports yet, and the page boots with no press; a file that always fails ends
//        on the words and a Reload press after exactly two reloads, then stays there (the press is one more try, never a loop); a third
//        party's script reloads nothing; the World's module failing behind the first screen gets the same second go
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
//   B-21 THE TOWN OPENS ON ITS VIEW (phone, first visit: Play waited 6.5 s for six sheets, the view drew two): with the other sheets held the
//        town opens and is painted, asks for nothing the view does not draw until the server has named its stand, then asks for all the others;
//        a view that draws a held sheet waits for it, a shadow falling off it does not (v0.2.97); a failed sheet, a read that never
//        answers and a sheet whose decode() never settles (v0.2.106) do not hold it shut. Its pixels: PB-VIEW
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
//   B-6  a password-reset link (#type=recovery) opens the set-new-password screen; an email link that came back with an error (expired, used
//        twice, opened first by a mail scanner) lands on sign-in and says what to do, and its error does not stay in the address
//   B-7  A 403 hr_closed ANSWER SHOWS THE CLOSED NOTICE, NOT THE GAME, AND A NEXT STEP (an invitee's first screen, 2026-11-03): invite-only, signed
//        up, their own id and nothing else of the account, Copy puts it on the clipboard (a refused clipboard says so and leaves it selected);
//        Check again is off while it asks, says why on a no or on no answer, and once the server admits the account the page goes on to their
//        characters with no second sign-in; Sign out works; every press fits at 1366x768 and on a landscape phone
//   B-20 THE PRIVACY POLICY AND THE TERMS CAN BE READ FROM THE SIGN-IN SCREENS (2026-11-04), at 1366x768 and 667x375: the sign-in offers both;
//        Create account says "By creating an account you agree to the Terms of Service and the Privacy Policy." with both as links, every word
//        12 px or more and on the screen, without pushing Create account or Back off it; each opens OVER the screen (what was typed stays typed),
//        shows its own page (the wipe, and for the Privacy Policy the recording switch and "on by default") with no note to the owner in it, fits
//        the screen and scrolls, closes with Escape or Close and gives the focus back; the reader escapes everything and links only https
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
// mutant-rule-functions: checks
// mutant-runner-functions: main
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, UID, serve, SDK_STUB } from './_client-harness.mjs';
import { TOWN_NAME } from '../src/data/world/town/plan.js';
import { scopedMutants } from '../tools/lib/mutant-scope.mjs';
import { pinFonts } from './_test-fonts.mjs';
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
  const order = ss.sceneSets(mapc.compileMap(row, tables), row, book, tables);
  return { sets: order.slice().sort(), order, all: ATLAS_SETS };
}
const TOWN_SHEETS = await sheetsOf('town_common');
const CELLAR_SHEETS = await sheetsOf('mill_cellar');

/* Two stands for B-20, from what the shipped map draws around them: the hearth's first (the stand a new hero takes in a quiet town) with its
   sheets read over a little more than a phone's 422x195, so no camera detail can add one, and a stand whose small view is sure to draw the Havora sheet. */
async function townStands() {
  const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
  const [{ ATLAS_SETS }, { WORLD_MAPS }, bookm, mapc, ter, comp, { STATIONS }] = await Promise.all(['src/data/world/atlas-sets.js', 'src/data/world/maps/index.js',
    'src/world/core/book.js', 'src/world/core/map-compile.js', 'src/data/world/terrain.js', 'src/world/core/compose.js', 'src/data/world/stations.js'].map(imp));
  const manifests = {};
  for (const s of ATLAS_SETS) manifests[s] = JSON.parse(await readFile(join(ROOT, 'assets/world/atlas-' + s + '.json'), 'utf8'));
  const book = bookm.createBook(manifests);
  const tables = { materials: ter.MATERIALS, sprites: new Proxy(book.sprites, { get: (t, k) => t[k] || bookm.STUB_SPRITE }), openClasses: ter.OPEN_CLASSES, lights: ter.LIGHTS };
  const map = mapc.compileMap(WORLD_MAPS.find((m) => m.id === 'town_common'), tables);
  const T = map.T || 32, ground = comp.groundOf(map, book, tables, T).tiles;
  const drawn = (x, y, w, h) => {
    const view = { ox: Math.max(0, Math.min(map.w * T - w, Math.round(x * T - w / 2))), oy: Math.max(0, Math.min(map.h * T - h, Math.round(y * T - h / 2))), w, h };
    const f = comp.composeFrame(map, book, { hero: { x, y } }, view, tables, T);
    const out = new Set([book.frame('outfit_knight').set]);
    const meets = (d) => d.x < view.ox + w && d.x + d.w > view.ox && d.y < view.oy + h && d.y + d.h > view.oy;
    for (const l of [f.decals, f.sprites, f.raised]) for (const d of l) if (d.set && meets(d)) out.add(d.set);
    for (const sh of f.shadows) if (sh.type === 'cast') out.add(sh.sprite.set);
    for (const t of ground) if (t.x < view.ox + w && t.x + T > view.ox && t.y < view.oy + h && t.y + T > view.oy) out.add(t.set);
    return Array.from(out);
  };
  const idle = STATIONS.find((s) => s.kind === 'idle');
  const stand = (s, i) => ({ station: s.id, no: i + 1, x: s.stands[i][0], y: s.stands[i][1] });
  const quiet = Object.assign(stand(idle, 0), { drawn: drawn(idle.stands[0][0], idle.stands[0][1], 440, 210) });
  let onHavora = null;
  for (const s of STATIONS) { for (let i = 0; i < (s.stands || []).length && !onHavora; i++) if (drawn(s.stands[i][0], s.stands[i][1], 120, 80).includes('havora')) onHavora = stand(s, i); if (onHavora) break; }
  return { quiet, onHavora };
}
const TOWN_VIEWS = await townStands();
const sheetOf = (url) => (/\/assets\/world\/atlas-([a-z0-9_]+)\.png/.exec(url) || [])[1] || null;

async function stubServer(page, o) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const url = r.request().url();
    const body = JSON.parse(r.request().postData() || '{}');
    if (o.down) return r.abort();
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
        o.slowReread = 1200;   // the re-read after a yes: slow enough to read the screen in between
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, slot_id: body.p_slot_id, hero_slots: o.slots }) });
      }
      if (o.slowReread) await new Promise((res) => setTimeout(res, o.slowReread));
      const slot = name === 'hr_load' ? body.p_slot : body.slot;
      const slots = o.slots || [0, 1];
      const next = o.ladder ? Object.keys(o.ladder).map(Number).find((k) => !slots.includes(k)) : undefined;
      const account = Object.assign({ max_concurrent: 4 }, o.ladder ? { hero_slots_max: 4, hero_slot_offer: next === undefined ? null : { slot_id: next, cost_gold: o.ladder[next] } } : {});
      if (name === 'hr_load' || name === 'hr-accrue') {
        const b = o.heroes[slot] ? envelope(slot, 1, { name: o.heroes[slot], hero_slots: slots, account,
          /* THE ACCOUNT PURSE (one per account): every hero states it; a lagging hero states an older version. */
          state: { active_kind: 'idle', gold: o.purse !== undefined ? (o.lag && o.lag[slot] ? o.lag[slot].gold : o.purse) : 0,
            gold_v: o.purse !== undefined ? (o.lag && o.lag[slot] ? o.lag[slot].v : o.goldV) : 0, level_xp: LEVEL_10_XP },
          /* B-9h: a hero the server holds in an open hunt ({ slot: hunt id }) */
          ...(o.hunting && o.hunting[slot] ? { hunt: { session_id: '5d1c0f2e-0000-4000-8000-00000000000' + slot, hunt_id: o.hunting[slot], ended: false } } : {}),
          ...(o.stamped ? { client_state: { awaySeen: { s: '5d1c0f2e-0000-4000-8000-00000000000' + slot, at: Date.parse('2026-10-17T00:00:00Z') - (o.stampedMin || 5) * 60000, xp: LEVEL_10_XP } } } : {}) })
          : { ok: false, error: 'no_character', hero_slots: slots };
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify(name === 'hr-accrue' ? Object.assign({ accrued: true }, b) : b) });
      }
    }
    if (url.endsWith('/rpc/hr_load')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify(o.hunt ? Object.assign({}, HUNT, { version: 1 }) : envelope(body.p_slot, 1)) });
    if (url.split('?')[0].endsWith('/functions/v1/hr-accrue')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify(Object.assign({ accrued: true }, o.hunt ? Object.assign({}, HUNT, { version: 2 }) : envelope(body.slot, 2))) });
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await pinFonts(page);
}

const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
/* wait, for a page that reloads itself: a navigation under a waitForFunction answers false at once. */
const until = async (page, fn, arg, ms = 60000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((k) => setTimeout(k, 200))) {
    try { if (await page.evaluate(fn, arg)) return true; } catch (e) { /* the page is on its way to the next load */ }
  }
  return false;
};

/* `leaving`: run B-17 and B-18 too. Together about 20 s a run: --mutate runs them for their own mutants and the clean control only, or
   36 mutants add 12 minutes to a 30-minute CI job (smoke.yml in-page, measured 14.2). `notice`: B-7's whole walk, the same way (with no flag, the notice's arrival only).
   `reloads`: B-19, the same way. */
/* A mutant needs ONE red rule: its run stops at the first. 61 mutants ran every rule, 57 of the 70 minutes v0.2.84's whole run took (41697486160). */
const STOP = Symbol('first red');
async function checks(overrides, leaving = true, notice = true, reloads = true, { stopAtFirst = false } = {}) {
  const fails = [];
  if (stopAtFirst) fails.push = function (...a) { Array.prototype.push.apply(this, a); throw STOP; };
  const { server, port } = await serve(overrides);
  const base = 'http://127.0.0.1:' + port;
  const browser = await leaseBrowser(chromium);
  try {
    const fresh = async (o = {}, viewport = { width: 1280, height: 720 }) => {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      await stubServer(page, o);
      return { ctx, page, errors };
    };

    /* mutant-rules-start */
    { // N-1
      const { ctx, page, errors } = await fresh();
      await page.goto(base + '/', { waitUntil: 'load' });
      const n = await page.evaluate(() => ({ link: !!document.querySelector('a[href="https://discord.gg/eJrUSUJM3M"]'),
        text: document.body.innerText, scripts: Array.from(document.scripts).map((s) => s.getAttribute('src')) }));
      if (!n.link || !/Discord gets the [a-z ]*date first/i.test(n.text)) fails.push('N-1 the notice page lost its copy or Discord link');
      if (n.scripts.some((s) => !/^src\/platform\/(https-upgrade|sw-killswitch)\.js\?v=\d[\d.]*$/.test(String(s)))) fails.push('N-1 the notice page loads an app script: ' + n.scripts.join(', '));
      await page.click('a[href="play.html"]').catch(() => fails.push('N-1 someone invited who typed the bare domain has no way in'));
      /* The client page itself answers; its boot is B-1's and B-16's rule, and how long 372 modules take on a busy disk is the machine's. */
      if (!(await wait(page, () => /\/play\.html$/.test(location.pathname) && document.querySelector('.boot-shell, form[data-auth="sign-in"]'), null, 30000))) fails.push('N-1 the way in does not reach the client page: ' + page.url());
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
      /* 372 modules on a busy disk: how fast they land is the machine's, not this rule's (read red twice with other lanes running) */
      if (!(await wait(page, () => document.querySelector('form[data-auth="sign-in"]') && !document.querySelector('.boot-shell'), null, 30000))) fails.push('B-16 the shell did not give way to the sign-in screen');
      if (errors.length) fails.push('B-16 console errors: ' + errors.join(' | '));
      await ctx.close();
      /* a module that cannot load says so (the wait never runs for ever), once the page's own second goes are spent (B-19) */
      const dead = await fresh();
      await dead.page.route('**/src/app/boot.js*', (r) => r.abort());
      await dead.page.goto(base + '/play.html', { waitUntil: 'commit' });
      if (!(await until(dead.page, () => /could not finish loading/.test((document.querySelector('.boot-shell-line') || {}).textContent || '')))) fails.push('B-16 a module that could not load left the shell saying it is still loading');
      await dead.ctx.close();
    }

    if (reloads) { // B-19
      const FAILS = (s) => '**/' + s + '*';
      const answer503 = (r) => r.fulfill({ status: 503, contentType: 'text/plain', body: 'Service Unavailable' });
      /* The page's own document loads, counted off the wire. */
      const docsOf = (page) => { const seen = { n: 0 }; page.on('request', (q) => { if (q.isNavigationRequest() && q.frame() === page.mainFrame()) seen.n++; }); return seen; };
      const atSignIn = (page) => until(page, () => document.querySelector('form[data-auth="sign-in"]') && !document.querySelector('.boot-shell'));
      /* A file of the entry's graph (the entry's own script fails), and a classic script from before the tab store has loaded (the verdict waits for the parse). */
      for (const [tag, file] of [['a file of the entry\'s graph', 'src/shell/windows/float-menu.js'], ['a classic script', 'src/vendor/supabase-js-']]) {
        const s = await fresh();
        const docs = docsOf(s.page);
        let hits = 0;
        await s.page.route(FAILS(file), (r) => (++hits === 1 ? answer503(r) : r.fallback()));
        await s.page.goto(base + '/play.html', { waitUntil: 'commit', timeout: 60000 });
        if (!(await atSignIn(s.page))) fails.push('B-19 [' + tag + '] one 503 on ' + file + ' stopped the page: ' + JSON.stringify((await s.page.evaluate(() => document.body.innerText)).slice(0, 120)));
        else if (docs.n !== 2) fails.push('B-19 [' + tag + '] the page took ' + docs.n + ' document load(s), want 2');
        if (!hits) fails.push('B-19 [' + tag + '] CONTROL: the route never answered');
        await s.ctx.close();
      }
      /* A preload nothing has imported yet, failing with the shell up (the entry held, so the link's own error is the only word of it). */
      {
        const s = await fresh();
        const docs = docsOf(s.page);
        let go = null;
        const shellUp = new Promise((k) => { go = k; });
        await s.page.route(FAILS('src/app/boot.js'), async (r) => { if (docs.n > 1) return r.fallback(); await new Promise(() => {}); });
        await s.page.route(FAILS('src/world/world-boot.js'), async (r) => { if (docs.n > 1) return r.fallback(); await shellUp; return answer503(r).catch(() => {}); });
        await s.page.goto(base + '/play.html', { waitUntil: 'commit', timeout: 60000 });
        await until(s.page, () => document.querySelector('.boot-shell') && document.readyState !== 'loading');
        go();
        if (!(await atSignIn(s.page))) fails.push('B-19 [a preload] one 503 on a preload stopped the page');
        else if (docs.n !== 2) fails.push('B-19 [a preload] the page took ' + docs.n + ' document load(s), want 2');
        await s.ctx.close();
      }
      /* Always down: exactly two reloads, then the words and the press, and it stays there. */
      const down = await fresh();
      const docs = docsOf(down.page);
      await down.page.route(FAILS('src/shell/windows/float-menu.js'), answer503);
      await down.page.goto(base + '/play.html', { waitUntil: 'commit', timeout: 60000 });
      const said = (page) => page.evaluate(() => { const b = document.querySelector('.boot-shell-again');
        return { words: /could not finish loading/.test((document.querySelector('.boot-shell-line') || {}).textContent || ''), press: !!b, seen: !!b && getComputedStyle(b).backgroundColor !== 'rgba(0, 0, 0, 0)' }; });
      if (!(await until(down.page, () => !!document.querySelector('.boot-shell-again')))) fails.push('B-19 a file that always fails never ended on the Reload press: ' + JSON.stringify(await said(down.page)) + ' after ' + docs.n + ' loads');
      else {
        const first = await said(down.page);
        if (!first.words) fails.push('B-19 the Reload press stands without the words');
        /* The images may be what is not arriving: the press draws itself (read off the screenshot: the gold plate's text alone was dark on dark). */
        if (!first.seen) fails.push('B-19 the Reload press has no fill of its own');
        const after = docs.n;
        await down.page.waitForTimeout(4000);
        if (after !== 3 || docs.n !== 3) fails.push('B-19 a file that always fails took ' + after + ' then ' + docs.n + ' document loads, want exactly 3 and no more');
        const box = await down.page.locator('.boot-shell-again').boundingBox();
        await down.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        for (let i = 0; i < 60 && docs.n < 4; i++) await down.page.waitForTimeout(250);
        if (docs.n < 4) fails.push('B-19 the Reload press did not reload the page');
        else {
          await until(down.page, () => !!document.querySelector('.boot-shell-again'));
          await down.page.waitForTimeout(4000);
          if (docs.n !== 4) fails.push('B-19 the press took ' + docs.n + ' document loads in all, want 4: one press, one try');
        }
      }
      await down.ctx.close();
      /* A third party's script failing reloads nothing. */
      const other = await fresh();
      const otherDocs = docsOf(other.page);
      let letBoot = null;
      const bootHeld = new Promise((k) => { letBoot = k; });
      await other.page.route('https://cdn.example.test/**', (r) => r.fulfill({ status: 503, body: '' }));
      /* The entry held, so the shell is up and listening when the third party's script fails. */
      await other.page.route(FAILS('src/app/boot.js'), async (r) => { await bootHeld; return r.fallback(); });
      await other.page.goto(base + '/play.html', { waitUntil: 'commit', timeout: 60000 });
      await until(other.page, () => document.querySelector('.boot-shell') && document.readyState !== 'loading');
      const refused = await other.page.evaluate(() => new Promise((k) => { const x = document.createElement('script'); x.onerror = () => k(true); x.onload = () => k(false); x.src = 'https://cdn.example.test/tracker.js'; document.head.appendChild(x); }));
      if (!refused) fails.push('B-19 CONTROL: the third party\'s script did not fail');
      await other.page.waitForTimeout(3500);
      if (otherDocs.n !== 1) fails.push('B-19 a third party\'s failing script reloaded the page: ' + otherDocs.n + ' document loads');
      letBoot();
      if (!(await atSignIn(other.page))) fails.push('B-19 a third party\'s script stopped the page');
      await other.ctx.close();
      /* The World's module, failing behind the first screen: the hero's Play reloads by itself, and the hero stands in the World. */
      const late = await fresh({ heroes: { 0: 'Tester' }, created: [] });
      const lateDocs = docsOf(late.page);
      let free = null;
      const held = new Promise((k) => { free = k; });
      /* Held past the first screen, then down for as long as this first page lasts: the preload and the import alike. */
      await late.page.route(FAILS('src/world/world-boot.js'), async (r) => { if (lateDocs.n > 1) return r.fallback(); await held; return answer503(r); });
      await late.page.goto(base + '/play.html', { waitUntil: 'commit', timeout: 60000 });
      if (!(await atSignIn(late.page))) fails.push('B-19 the sign-in screen waited on the World\'s module');
      else {
        await late.page.fill('input[name=email]', 'qa@example.test');
        await late.page.fill('input[name=password]', 'not-a-real-password');
        await late.page.click('.auth-submit');
        await wait(late.page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
        free();
        await late.page.waitForTimeout(2500);   // past the first reload's pause (load-shell.js RETRY_PAUSES), or a reload under the player would still be on its way
        if (lateDocs.n !== 1) fails.push('B-19 a preload failing behind the first screen reloaded the page under the player');
        await late.page.click('[data-app="play"][data-slot="0"]');
        if (!(await until(late.page, () => document.querySelector('#panel-world canvas')))) fails.push('B-19 the World\'s module failing once left the hero out of the World: ' + JSON.stringify((await late.page.evaluate(() => document.body.innerText)).slice(0, 160)));
        else if (lateDocs.n !== 2) fails.push('B-19 the World\'s module took ' + lateDocs.n + ' document load(s), want 2');
      }
      free();
      await late.ctx.close();
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
      /* B-4 SIGN OUT STAYS WHERE IT WAS PRESSED (Andy 2026-11-06: "sometimes I sign out and it brings me to my character list"): on a
         desktop the strip's tools rode behind the hero tabs, so a tab arriving or a hero's status changing slid Characters under a
         pointer aimed at Sign out. They stand against the icon row the strip keeps clear of (its padding), at one tab and at two, on
         a 1920 px screen (at 1280 the icon row leaves the strip no room to slide in). */
      const toolsAt = async () => {
        await wait(page, () => document.querySelector('.hs-launchers') && document.querySelector('nav.char-strip').style.paddingRight);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.waitForTimeout(100);
        const at = await page.evaluate(() => {
          const gap = Math.round(document.querySelector('.hs-launchers').getBoundingClientRect().left - document.querySelector('nav.char-strip [data-app="sign-out"]').getBoundingClientRect().right);
          return gap >= 0 && gap <= 16 ? 'against the icon row' : 'Sign out ends ' + gap + ' px left of the icon row';
        });
        await page.setViewportSize({ width: 1280, height: 720 });
        return at;
      };
      const oneTab = await toolsAt();
      if (oneTab !== 'against the icon row') fails.push('B-4 with one hero tab, ' + oneTab + ': the tools ride the tabs, and a press aimed at Sign out lands on Characters when a tab grows');
      await page.click('[data-app="characters"]');
      if (!(await wait(page, () => document.querySelector('[data-app="play"][data-slot="1"]')))) fails.push('B-4 no way back to the characters screen');
      else {
        await page.click('[data-app="play"][data-slot="1"]');
        const two = await wait(page, (uid) => document.querySelectorAll('.char-tab[data-app="show"]').length === 2
          && window.__hub.channels['hr:' + uid + ':0'] && window.__hub.channels['hr:' + uid + ':1']
          && document.querySelector('#panel-world[data-slot="1"]'), UID);
        if (!two) fails.push('B-4 a second character did not open beside the first');
        else { const twoTabs = await toolsAt(); if (twoTabs !== 'against the icon row') fails.push('B-4 with two hero tabs, ' + twoTabs + ': the tools moved with the tabs'); }
        /* B-4 ON A PHONE EACH HERO HAS A TAB YOU CAN PRESS (first-hour play 2026-10-31: at 922x423 the tools and the icon row
           left each tab 12 px; no hero could be seen or switched to, and Invite to party starts on that tab). */
        await page.setViewportSize({ width: 922, height: 423 });
        const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('.char-tab[data-app="show"]')).map((b) => Math.round(b.getBoundingClientRect().width)));
        await page.setViewportSize({ width: 1280, height: 720 });
        if (tabs.length !== 2 || tabs.some((w) => w < 44)) fails.push('B-4 on a 922x423 phone the hero tabs are ' + tabs.join(' and ') + ' px wide, too narrow to press');
      }
      /* B-5 SIGN OUT PLAYS NO HERO ON ITS WAY OUT: with hero 0 shown and closed first, the next hero was shown in its place (a
         settle) and the chat re-read for it, after the press. Only the heroes' leaves and their last residue belong to a sign-out. */
      await page.click('.char-tab[data-app="show"][data-slot="0"]');
      await page.waitForTimeout(400);
      const asked = [];
      let out = 0;
      const onAsk = (q) => { const m = /\/rest\/v1\/rpc\/([a-z_]+)|\/functions\/v1\/(hr-accrue)/.exec(q.url()); if (m) asked.push({ n: m[1] || m[2], late: out > 0 }); };
      page.on('request', onAsk);
      await page.evaluate(() => { window.__hub.left = []; });   // the topics this press leaves, in order
      await page.click('[data-app="sign-out"]');
      if (!(await wait(page, () => document.querySelector('form[data-auth="sign-in"]')))) fails.push('B-5 sign-out did not return to sign-in');
      out = 1;
      await page.waitForTimeout(2500);   // past a town keepalive's pollMs (2 s): a hero still standing would ask again
      page.off('request', onAsk);
      const shown = asked.filter((a) => a.n === 'hr-accrue' || a.n === 'hr_chat_recent').map((a) => a.n);
      const later = asked.filter((a) => a.late).map((a) => a.n);
      if (shown.length) fails.push('B-5 a Sign out press showed the next hero on its way out: ' + shown.join(', '));
      if (later.length) fails.push('B-5 after the sign-in screen the page still asked the server ' + later.join(', '));
      const left = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)]
        .filter((k) => k === 'hr-auth' || k.startsWith('hr-auth-') || k.startsWith('sb-') || k === 'hr-tab-id' || k === 'hr-open' || k === 'hearthrise:supabaseSession'));
      if (left.length) fails.push('B-5 session copies left after sign-out: ' + left.join(', '));
      const topics = await page.evaluate(() => Object.keys(window.__hub.channels));
      if (topics.length) fails.push('B-5 character topics still joined after sign-out: ' + topics.join(', '));
      /* ...and the social side (the whispers inbox, any chat channel) leaves before the first hero does, so nothing social follows a
         hero while every hero closes. Read from the order the stub saw the topics left (__hub.left), not from the network. */
      const order = await page.evaluate(() => window.__hub.left || []);
      const firstHero = order.findIndex((t) => /^hr:/.test(t)), social = order.filter((t) => !/^hr:/.test(t));
      if (firstHero < 0 || !social.length) fails.push('B-5 harness: the sign-out left ' + (order.join(', ') || 'no topic') + ' (a hero topic and a social one are needed to read the order)');
      else if (order.slice(firstHero).some((t) => !/^hr:/.test(t))) fails.push('B-5 a hero closed before the social side ended: topics left in the order ' + order.join(', '));
      if (errors.length) fails.push('B-1..5 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // B-6
      const { ctx, page } = await fresh();
      await page.goto(base + '/play.html#access_token=x&type=recovery', { waitUntil: 'load' });
      if (!(await wait(page, () => document.querySelector('form[data-auth="set-password"]')))) fails.push('B-6 a reset link did not open the set-new-password screen');
      await ctx.close();
      /* The link that did not work: what the auth server sends back for one expired, used twice, or opened first by a mail scanner. */
      const dead = await fresh();
      await dead.page.goto(base + '/play.html#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', { waitUntil: 'load' });
      await wait(dead.page, () => document.querySelector('form[data-auth="sign-in"]'));
      const said = await dead.page.evaluate(() => ({ line: document.querySelector('.auth-message')?.textContent || '', hash: location.hash }));
      if (!/expired or was already used/.test(said.line) || !/Forgot your password/.test(said.line)) fails.push('B-6 a dead email link lands on sign-in with ' + JSON.stringify(said.line));
      if (said.hash) fails.push('B-6 a dead email link stays in the address: ' + JSON.stringify(said.hash));
      /* The email typed once stays typed: a wrong password, then Forgot your password, never asks for it again. */
      await dead.page.fill('input[name=email]', 'stranger@example.test');
      await dead.page.click('[data-auth-go="forgot"]');
      const onForgot = await dead.page.inputValue('form[data-auth="forgot"] input[name=email]');
      await dead.page.click('[data-auth-go="sign-in"]');
      const onSignIn = await dead.page.inputValue('form[data-auth="sign-in"] input[name=email]');
      if (onForgot !== 'stranger@example.test' || onSignIn !== 'stranger@example.test') fails.push('B-6 the typed email did not follow the screens: ' + JSON.stringify([onForgot, onSignIn]));
      /* "Not confirmed" is not a circle: a confirmation link lasts an hour, so the screen offers a new one, and only then. */
      const again = await dead.page.evaluate(async () => {
        const { renderAuthScreen } = await import(location.origin + '/src/app/sign-in.js');
        const box = document.createElement('div'); document.body.append(box);
        const tick = () => new Promise((r) => setTimeout(r, 0));
        const asked = [];
        let answer = { ok: false, message: 'wrong password' };
        renderAuthScreen(box, { signIn: async () => answer, resendConfirmation: async (e) => { asked.push(e); return { ok: true, message: 'on its way' }; } }, 'sign-in', {}, 'a@b.co');
        const form = box.querySelector('form'), press = () => box.querySelector('[data-auth-resend]');
        const shown = () => !!press() && press().getClientRects().length > 0;
        const out = { first: shown() };
        form.dispatchEvent(new Event('submit', { cancelable: true })); await tick();
        out.wrong = shown();
        answer = { ok: false, unconfirmed: true, message: 'not confirmed' };
        form.dispatchEvent(new Event('submit', { cancelable: true })); await tick();
        out.unconfirmed = shown();
        if (out.unconfirmed) press().click();
        await tick();
        out.asked = asked; out.said = box.querySelector('.auth-message').textContent;
        box.remove();
        return out;
      });
      if (again.first || again.wrong || !again.unconfirmed || again.asked.join() !== 'a@b.co' || again.said !== 'on its way') fails.push('B-6 a new confirmation link: ' + JSON.stringify(again));
      await dead.ctx.close();
    }

    { // B-20 THE PRIVACY POLICY AND THE TERMS CAN BE READ FROM THE SIGN-IN SCREENS (2026-11-04: no screen linked them)
      for (const [w, h] of [[1366, 768], [667, 375]]) {
        const tag = '[' + w + 'x' + h + '] ';
        const { ctx, page, errors } = await fresh({}, { width: w, height: h });
        try {
        await page.goto(base + '/play.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await wait(page, () => document.querySelector('form[data-auth="sign-in"]'), null, 60000);
        const onSignIn = await page.evaluate(() => [...document.querySelectorAll('.auth-legal [data-auth-legal]')].map((b) => b.getAttribute('data-auth-legal')).join());
        if (onSignIn !== 'privacy,terms') fails.push('B-20 ' + tag + 'the sign-in screen does not offer the Privacy Policy and the Terms: ' + JSON.stringify(onSignIn));
        await page.click('[data-auth-go="create"]');
        const sheet = await page.evaluate(() => {
          const l = document.querySelector('.auth-legal');
          const r = (e) => { const b = e.getBoundingClientRect(); return b.left >= 0 && b.top >= 0 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5; };
          return { text: l ? l.innerText.replace(/\s+/g, ' ').trim() : '', shown: !!l && l.getClientRects().length > 0, px: l ? parseFloat(getComputedStyle(l).fontSize) : 0,
            links: l ? [...l.querySelectorAll('[data-auth-legal]')].map((b) => [b.getAttribute('data-auth-legal'), parseFloat(getComputedStyle(b).fontSize), r(b)]) : [],
            submit: r(document.querySelector('.auth-submit')), back: r(document.querySelector('[data-auth-go="sign-in"]')), across: document.scrollingElement.scrollWidth - innerWidth };
        });
        if (sheet.text !== 'By creating an account you agree to the Terms of Service and the Privacy Policy.' || !sheet.shown) fails.push('B-20 ' + tag + 'Create account does not say what pressing it means: ' + JSON.stringify(sheet.text));
        if (sheet.px < 12 || sheet.links.length !== 2 || sheet.links.some(([, px, on]) => px < 12 || !on)) fails.push('B-20 ' + tag + 'the legal line or its links are under 12 px or off the screen: ' + JSON.stringify([sheet.px, sheet.links]));
        if (!sheet.submit || !sheet.back || sheet.across > 0) fails.push('B-20 ' + tag + 'the legal line pushed Create account or Back to sign in off the screen (' + sheet.across + ' px across)');
        await page.fill('input[name=email]', 'new@example.test');
        await page.fill('input[name=password]', 'not-a-real-password');
        await page.fill('input[name=confirm]', 'not-a-real-password');
        for (const [which, title, wants] of [['terms', 'Terms of Service', [/Gold, items and purchases/, /Testing and wipes/, /erased before Hearthrise opens on Steam Early Access/]],
          ['privacy', 'Privacy Policy', [/Share session recordings to help fix bugs/, /on by default/, /Session recordings/, /erased before Hearthrise opens on Steam Early Access/]]]) {
          if (!(await page.$('[data-auth-legal="' + which + '"]'))) { fails.push('B-20 ' + tag + 'there is no link to the ' + title + ' on the screen'); continue; }
          await page.click('[data-auth-legal="' + which + '"]');
          if (!(await wait(page, () => { const b = document.querySelector('.auth-doc-body'); return !!b && b.innerText.length > 200; }, null, 15000))) { fails.push('B-20 ' + tag + title + ' did not load'); continue; }
          const doc = await page.evaluate(() => {
            const card = document.querySelector('.auth-doc-card'), body = document.querySelector('.auth-doc-body'), close = document.querySelector('.auth-doc-close');
            const b = card.getBoundingClientRect(), c = close.getBoundingClientRect();
            return { title: document.querySelector('.auth-doc-name').textContent, text: body.innerText, px: parseFloat(getComputedStyle(body).fontSize), html: body.innerHTML,
              fits: b.left >= 0 && b.top >= 0 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5, close: c.top >= 0 && c.bottom <= innerHeight && c.left >= 0 && c.right <= innerWidth,
              scrolls: body.scrollHeight > body.clientHeight, focus: document.activeElement === close, across: document.scrollingElement.scrollWidth - innerWidth };
          });
          if (doc.title !== title) fails.push('B-20 ' + tag + 'the reader says ' + JSON.stringify(doc.title) + ', want ' + title);
          for (const re of wants) if (!re.test(doc.text)) fails.push('B-20 ' + tag + title + ' does not say ' + re);
          if (/OWNER AND LAWYER|<!--|-->|\[LAUNCH DATE\]/.test(doc.text + doc.html)) fails.push('B-20 ' + tag + title + ' shows a note to the owner, or a launch-date placeholder, to players');
          if (!doc.fits || !doc.close || doc.across > 0 || !doc.scrolls || doc.px < 12 || !doc.focus) fails.push('B-20 ' + tag + title + ' reader: ' + JSON.stringify({ fits: doc.fits, close: doc.close, across: doc.across, scrolls: doc.scrolls, px: doc.px, focus: doc.focus }));
          const kept = await page.evaluate(() => ['email', 'password', 'confirm'].map((n) => (document.querySelector('input[name=' + n + ']') || {}).value).join('|'));
          if (kept !== 'new@example.test|not-a-real-password|not-a-real-password') fails.push('B-20 ' + tag + 'opening ' + title + ' lost what was typed: ' + JSON.stringify(kept));
          await (which === 'terms' ? page.keyboard.press('Escape') : page.click('.auth-doc-close', { timeout: 3000 }).catch(() => {}));
          if (!(await wait(page, () => !document.querySelector('.auth-doc'), null, 3000))) fails.push('B-20 ' + tag + title + ' did not close');
          else if (!(await page.evaluate((k) => document.activeElement && document.activeElement.getAttribute('data-auth-legal') === k, which))) fails.push('B-20 ' + tag + 'closing ' + title + ' did not give the focus back to its link');
        }
        /* the reader draws only what the rules allow: every character escaped, only https and mailto links, comments gone */
        const drawn = await page.evaluate(async () => {
          const { legalHtml } = await import(location.origin + '/src/app/legal-reader.js');
          return legalHtml('# T\n\n<img src=x onerror=alert(1)> **b** [ok](https://a.example/x) [bad](javascript:alert(1))\n\n<!-- note -->\n\n* one\n* two', { dropTitle: true });
        });
        if (/<img|href="javascript|note/.test(drawn) || !/<strong>b<\/strong>/.test(drawn) || !/href="https:\/\/a\.example\/x"/.test(drawn) || !/<ul><li>one<\/li><li>two<\/li><\/ul>/.test(drawn)) fails.push('B-20 ' + tag + 'the reader drew: ' + drawn);
        /* the one server link reads only the listed legal pages: any other path is refused with no request made */
        const link = await page.evaluate(async () => {
          const { readLegal } = await import(location.origin + '/src/session/server.js');
          const asked = [];
          const stub = async (u) => { asked.push(String(u)); return { ok: true, text: async () => 'page' }; };
          const out = { ok: await readLegal('legal/PRIVACY_POLICY.md', location.href, stub), bad: [] };
          for (const p of ['src/build-info.js', 'legal/../src/build-info.js', 'legal/PRIVACY_POLICY.md?x=1', 'https://evil.example/legal/PRIVACY_POLICY.md', '/legal/PRIVACY_POLICY.md', 'legal/EULA.md', '']) out.bad.push(await readLegal(p, location.href, stub));
          out.asked = asked;
          return out;
        });
        if (link.ok !== 'page' || link.bad.some((x) => x !== null) || link.asked.length !== 1 || !/\/legal\/PRIVACY_POLICY\.md$/.test(link.asked[0])) fails.push('B-20 ' + tag + 'the server link read a path outside its list, or refused one on it: ' + JSON.stringify(link));
        if (errors.length) fails.push('B-20 ' + tag + 'console errors: ' + errors.slice(0, 3).join(' | '));
        } catch (e) {
          if (e === STOP) throw e;
          fails.push('B-20 ' + tag + 'stopped: ' + String(e && e.message).split('\n')[0]);
        } finally { await ctx.close().catch(() => {}); }
      }
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

      /* A RELOAD ON THE HEELS OF A RETURN KEEPS THE AWAY CARD (played 2026-11-04: reloaded 0.6 s and 2 s after Play, the next load said nothing): left within its reading time, the
         card is still owed: no stamp moves and its id is not filed as seen. Past the reading time it counts as read. */
      const owed = { heroes: { 0: 'Tester' }, hunting: { 0: 'mill_cellar' }, created: [], puts: [], stamped: true, stampedMin: 60, slots: [0] };
      const r = await fresh(owed);
      await r.page.goto(base + '/play.html', { waitUntil: 'load' });
      await wait(r.page, () => document.querySelector('form[data-auth="sign-in"]'));
      await r.page.fill('input[name=email]', 'qa@example.test');
      await r.page.fill('input[name=password]', 'not-a-real-password');
      await r.page.click('.auth-submit');
      await wait(r.page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
      await r.page.click('[data-app="play"][data-slot="0"]');
      if (!(await wait(r.page, () => /While you were away/.test((document.querySelector('.hw-alert') || {}).textContent || '')))) fails.push('B-17 CONTROL: no away card on the return');
      await r.page.reload({ waitUntil: 'load' });
      await r.page.waitForTimeout(500);
      const lost = owed.puts.filter((p) => p.p_patch && (Number.isFinite(p.p_patch.awaySeen && p.p_patch.awaySeen.at) && p.p_patch.awaySeen.at !== Date.parse('2026-10-17T00:00:00Z') - 60 * 60000
        || (p.p_patch.alerts && (p.p_patch.alerts.seen || []).some((id) => /^away:/.test(id)))));
      if (lost.length) fails.push('B-17 a reload seconds after the return used the away card up: ' + JSON.stringify(lost.map((p) => p.p_patch)).slice(0, 400));
      await r.ctx.close();

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

    { // B-21 the town opens on its view: a phone's first frame waits only for the sheets that view draws; the rest come behind it
      const PHONE = { width: 844, height: 390 };
      const answerWith = (page, stand) => page.route('**/rpc/hr_town_view*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, map: 'town_common', inst: 1, cap: 120, full: true, cursor: Date.now(),
        area: [0, 0, 255, 255], walkers: [], gone: [], me: { map: 'town_common', inst: 1, station: stand.station, stand: stand.no, x: stand.x, y: stand.y, gx: stand.x, gy: stand.y, dir: 's', at: [stand.x, stand.y], work: false, since_ms: 1 } }) }));
      const toPlay = async (page) => {
        await page.goto(base + '/play.html', { waitUntil: 'load' });
        await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
        await page.fill('input[name=email]', 'qa@example.test');
        await page.fill('input[name=password]', 'not-a-real-password');
        await page.click('.auth-submit');
        await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
        await page.click('[data-app="play"][data-slot="0"]');
      };
      const opened = (page, ms) => wait(page, () => document.querySelector('.hs-launchers') && document.querySelector('#panel-world canvas.world-canvas') && !document.querySelector('.world-status'), null, ms);
      const late = TOWN_SHEETS.order.filter((s) => !TOWN_VIEWS.quiet.drawn.includes(s));
      if (!late.includes('havora')) fails.push('B-21 harness: the first hearth stand now draws the Havora sheet (' + TOWN_VIEWS.quiet.drawn.join() + '): pick another stand');

      { // the first view opens with its other sheets held, asks for none of them on the town's start while the server has yet to name its stand, and asks for them all as it opens
        const { ctx, page, errors } = await fresh({}, PHONE);
        let named = null;
        const naming = new Promise((k) => { named = k; });
        await answerWith(page, TOWN_VIEWS.quiet);
        /* registered last, so asked first: the read is held here, then falls through to its answer */
        await page.route('**/rpc/hr_town_view*', async (r) => { await naming; return r.fallback(); });
        const gates = new Map(), asked = [];
        for (const s of late) { let open = null; const shut = new Promise((k) => { open = k; }); gates.set(s, { shut, open }); }
        await page.route('**/assets/world/atlas-*.png*', async (r) => {
          const s = sheetOf(r.request().url());
          asked.push(s);
          if (gates.has(s)) await gates.get(s).shut;
          return r.continue();
        });
        await toPlay(page);
        /* the town's start draws the Havora sheet: nothing may ask for it on a stand the server has not named (the prewarm is held at the first late sheet) */
        await page.waitForTimeout(1000);
        /* a phone back from another app mid-wait: the page runs a frame, and that frame asks for nothing either */
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await page.waitForTimeout(500);
        if (asked.includes('havora')) fails.push('B-21 the Havora sheet was asked for before the server named the stand: ' + asked.join());
        named();
        const open = await opened(page, 15000);
        if (!open) fails.push('B-21 with ' + late.join() + ' held the town never opened on its view (asked: ' + asked.join() + ')');
        else {
          /* its ground bakes a slice a frame first (the last frame stays), so the picture comes within a moment of the bar */
          const painted = await wait(page, () => { const c = document.querySelector('canvas.world-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const seen = new Set();
            for (let i = 0; i < d.length; i += 4000) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); return seen.size >= 8; }, null, 8000);
          if (!painted) fails.push('B-21 the town opened and painted nothing with ' + late.join() + ' held');
          for (const s of TOWN_VIEWS.quiet.drawn) if (!asked.includes(s)) fails.push('B-21 the first view drew from ' + s + ' without asking for it');
          for (let k = 0; k < 300 && !late.every((s) => asked.includes(s)); k++) await page.waitForTimeout(25);
          const never = late.filter((s) => !asked.includes(s));
          if (never.length) fails.push('B-21 behind the first view the page never asked for ' + never.join() + ' (asked: ' + asked.join() + ')');
        }
        for (const g of gates.values()) g.open();
        if (errors.length) fails.push('B-21 console errors: ' + errors.slice(0, 3).join(' | '));
        await ctx.close();
      }

      { // a first view that DOES draw the held sheet waits for it: never a stub
        const { ctx, page, errors } = await fresh({}, PHONE);
        await answerWith(page, TOWN_VIEWS.onHavora);
        let open = null, hits = 0;
        const shut = new Promise((k) => { open = k; });
        await page.route('**/assets/world/atlas-havora.png*', async (r) => { hits++; await shut; return r.continue(); });
        await page.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window); window.__rafs = 0; window.__rafBy = {}; window.requestAnimationFrame = (cb) => { window.__rafs++; const by = (new Error().stack.split('\n')[2] || '').trim().split('/').pop(); window.__rafBy[by] = (window.__rafBy[by] || 0) + 1; return raf(cb); }; });
        await toPlay(page);
        for (let k = 0; k < 400 && !hits; k++) await page.waitForTimeout(25);
        /* the wait costs the main thread nothing: its other sheets land while it is held, and no frame loop starts for frames that cannot show */
        await page.waitForTimeout(500);
        /* counted over a plain timer: Playwright's own waitForFunction polls on animation frames */
        const rafs0 = await page.evaluate(() => window.__rafs);
        await page.waitForTimeout(1000);
        const spun = (await page.evaluate(() => window.__rafs)) - rafs0;
        if (spun > 10) fails.push('B-21 while the first view waited on its sheet the page asked for ' + spun + ' animation frames in 1 s: the frame loop runs for frames that cannot show: ' + JSON.stringify(await page.evaluate(() => window.__rafBy)));
        const early = await opened(page, 500);
        open();
        const later = await opened(page, 15000);
        if (!hits) fails.push('B-21 a view on the Havora sheet never asked for it');
        else if (early) fails.push('B-21 a first view that draws the Havora sheet opened before it arrived');
        else if (!later) fails.push('B-21 a first view never opened once its sheet arrived');
        if (errors.length) fails.push('B-21 console errors: ' + errors.slice(0, 3).join(' | '));
        await ctx.close();
      }

      { // a sheet that fails is not waited for (it draws stubs, as it always has)
        const { ctx, page, errors } = await fresh({}, PHONE);
        await answerWith(page, TOWN_VIEWS.quiet);
        await page.route('**/assets/world/atlas-common.png*', (r) => r.abort());
        await toPlay(page);
        if (!(await opened(page, 15000))) fails.push('B-21 a first-view sheet that failed held the town shut: ' + await page.evaluate(() => (document.querySelector('.world-status') || {}).textContent || 'no line'));
        const bad = errors.filter((e) => !/Failed to load resource|ERR_FAILED/.test(e));
        if (bad.length) fails.push('B-21 console errors: ' + bad.slice(0, 3).join(' | '));
        await ctx.close();
      }

      { // the server never says where the hero stands: the town still opens, on its start, as a frame would
        const { ctx, page } = await fresh({}, PHONE);
        await page.route('**/rpc/hr_town_view*', () => new Promise(() => {}));
        await toPlay(page);
        if (!(await opened(page, 20000))) fails.push('B-21 a read that never answers held the town shut');
        await ctx.close();
      }

      { // a sheet whose decode() never settles (a page that is not rendering; live v0.2.106: 60-100 s on "Still loading the world") is not waited on
        const { ctx, page, errors } = await fresh({}, PHONE);
        await answerWith(page, TOWN_VIEWS.quiet);
        await page.addInitScript(() => { window.__decodes = 0; HTMLImageElement.prototype.decode = function () { window.__decodes++; return new Promise(() => {}); }; });
        await toPlay(page);
        if (!(await opened(page, 15000))) fails.push('B-21 a sheet whose decode() never settles held the town shut: ' + await page.evaluate(() => (document.querySelector('.world-status') || {}).textContent || 'no line'));
        else if (!(await page.evaluate(() => window.__decodes))) fails.push('B-21 harness: no sheet called decode(), so a stuck decode was never met (src/render/images.js)');
        if (errors.length) fails.push('B-21 console errors: ' + errors.slice(0, 3).join(' | '));
        await ctx.close();
      }
    }

    { // B-13 a sheet that lands after its pane was closed draws nothing and wakes no presence
      /* THE ORDER IS FORCED (release/v0.2.96 run 42081767870: the mutant escaped on CI). The characters screen's prewarm can ask
         for the Common's sheet before Play, so a sheet asked for never meant the World waited on it, and a close sent at once beat
         the World's first town frame. The pane closes only once the World has drawn the town (its first walkers read, made in the
         same step that asks for the sheets that frame draws: walkState, then view-sheets.js check); the sheets stay held until
         after the close, and woke is read only once they have landed. Each step of that order is a harness control. */
      const o = { hunt: true };
      const { ctx, page, errors } = await fresh(o);
      let release = null, asked = 0;
      const held = new Promise((r) => { release = r; });
      const back = TOWN_SHEETS.sets.filter((s) => !CELLAR_SHEETS.sets.includes(s));
      const askedSets = new Set(), landed = new Map(), lost = [];
      await page.route('**/assets/world/atlas-*.png*', async (r) => {
        const set = sheetOf(r.request().url());
        if (back.includes(set)) { asked++; askedSets.add(set); await held; }
        return r.continue();
      });
      const town = [];
      page.on('request', (q) => { if (/\/rpc\/hr_town_view/.test(q.url())) town.push(Date.now()); });
      page.on('requestfinished', (q) => { const set = sheetOf(q.url()); if (back.includes(set)) landed.set(set, Date.now()); });
      page.on('requestfailed', (q) => { const set = sheetOf(q.url()); if (back.includes(set)) lost.push(set); });
      await page.goto(base + '/play.html', { waitUntil: 'load' });
      await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
      await page.fill('input[name=email]', 'qa@example.test');
      await page.fill('input[name=password]', 'not-a-real-password');
      await page.click('.auth-submit');
      await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
      await page.click('[data-app="play"][data-slot="0"]');
      const inCellar = await wait(page, () => /Mill Cellar/.test((document.querySelector('#panel-world .world-title') || {}).textContent || ''));
      o.hunt = false;
      const sent = Date.now();
      await page.evaluate(([uid, env]) => window.__hub.send('hr:' + uid + ':0', { t: 'state', frame: 20, env }, 'frame'), [UID, envelope(0, 20)]);
      let drawn = false;
      for (let i = 0; i < 300 && !(drawn = town.some((t) => t >= sent)); i++) await page.waitForTimeout(50);
      await page.click('[data-app="characters"]');
      await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
      await page.waitForTimeout(300);
      const mark = Date.now();
      const early = [...landed.keys()];   // nothing held can land before release(): one that did was never held
      release();
      const arrivedAll = () => askedSets.size > 0 && [...askedSets].every((s) => landed.get(s) >= mark);
      for (let i = 0; i < 200 && !arrivedAll() && !lost.length; i++) await page.waitForTimeout(50);
      const arrived = arrivedAll();
      /* landed: its decode, the ensure() it settles and that ensure's wake are the page's next tasks */
      for (let i = 0; i < 40 && !town.some((t) => t >= mark); i++) await page.waitForTimeout(50);
      const woke = town.filter((t) => t >= mark).length;
      if (!back.length) fails.push('B-13 harness: the Common adds no sheet to the cellar\'s (' + TOWN_SHEETS.sets.join() + ')');
      else if (!inCellar || !asked) fails.push('B-13 harness: the hero never hunted the cellar (' + inCellar + ') or the Common\'s sheet was never asked for (' + asked + ')');
      else if (!drawn) fails.push('B-13 harness: the World never drew the Common after the hunt (no walkers read in 15 s): the pane would close before anything waits on its sheet');
      else if (early.length) fails.push('B-13 harness: ' + early.join() + ' landed before the pane was closed: the late sheet was not held');
      else if (lost.length || !arrived) fails.push('B-13 harness: the held sheet(s) ' + [...askedSets].join() + ' never landed after the close (failed: ' + (lost.join() || 'none') + ')');
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
      if (pitch !== 'Your hero keeps hunting after you close the game.') fails.push('B-9 the sign-in screen pitches ' + JSON.stringify(pitch));
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
        /* The creation step: a name and how you fight; nothing is sent before Enter town. The four color strips and the real hero show beside them
           (outfits.js HERO_DYES_SHOWN, lane/c-hero-colors), and Enter town shows with no scrolling at a laptop's 1366x768. */
        await page.setViewportSize({ width: 1366, height: 768 });
        const step = await wait(page, () => document.querySelector('.hero-name') && document.querySelector('.hero-how-list'));
        if (!step) fails.push('B-9 Create did not open the creation step (sent ' + JSON.stringify(o.created) + ')');
        else {
          const laptop = await page.evaluate(() => { const b = document.querySelector('.hero-confirm').getBoundingClientRect(); return { bottom: Math.round(b.bottom), H: innerHeight, doc: document.documentElement.scrollHeight, dyes: document.querySelectorAll('.hero-region, .hero-preview, .hero-note').length }; });
          if (laptop.bottom > laptop.H || laptop.doc > laptop.H || laptop.dyes !== 6) fails.push('B-9 at 1366x768 the creation step reads ' + JSON.stringify(laptop));
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
        lag: { 1: { gold: 90000, v: 3 } }, ladder: { 2: 15000, 3: 40000 } };   // four heroes an account (Tyler 2026-11-07): slots 2 and 3 are sold, no fifth
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
      /* The price is the offer block's own (the server's quote), so the line names none (designer 2026-11-09). */
      if (!/You own 2 hero slots\. Up to 4 heroes can play at once, and more slots cost gold\./.test(lead)) fails.push('B-11 the line over the roster reads ' + JSON.stringify(lead));
      /* 14,100 at wallet version 7 is the purse; Fennick's older answer (90,000 at version 3) is not. */
      if (!b0 || b0.text !== 'Buy a hero slot for 15,000 gold' || !b0.off || b0.pay !== '0' || b0.picker
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
        /* The yes is on screen at once, over the list, with the button still off: "Reading your characters…" alone for 2.5 s let a player press again (board 11-04). */
        const told = await wait(page, () => /Hero slot bought/.test((document.querySelector('.auth-message') || {}).textContent || ''));
        const between = await page.evaluate(() => ({ rows: document.querySelectorAll('.char-row').length, reading: /Reading your characters/.test(document.body.textContent),
          off: !!(document.querySelector('[data-app="buy-slot"]') || {}).disabled }));
        if (!told || between.rows !== 2 || between.reading || !between.off) fails.push('B-11 between the yes and the re-read: ' + JSON.stringify({ told: !!told, ...between }));
        o.slowReread = 0;
        const reread = await wait(page, () => document.querySelectorAll('.char-row').length === 3 && document.querySelector('[data-app="create"][data-slot="2"]'));
        const sent = o.bought[0] || {};
        if (o.bought.length !== 1 || sent.p_slot_id !== 2 || sent.p_slot !== 0 || typeof sent.p_idem !== 'string' || Object.keys(sent).some((k) => /price|cost|gold/.test(k)))
          fails.push('B-11 the press sent ' + JSON.stringify(o.bought));
        const b3 = await btn();
        /* The new slot stands empty, so no other is on sale until a hero is in it (newcomer panel 2026-11-01); the third hero brings the fourth slot's price. */
        if (!reread || b3) fails.push('B-11 after the purchase the roster reads ' + JSON.stringify(b3) + (reread ? ' beside the new empty slot' : ' with no new empty slot'));
        o.slots.push(3);
        await page.reload({ waitUntil: 'load' });
        await wait(page, () => document.querySelectorAll('.char-row').length === 4);
        if ((await page.$$('.char-row')).length !== 4 || await page.$('[data-app="buy-slot"]')) fails.push('B-11 at four slots the roster still offers a slot, or does not list four');
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
      const NOTICE = '[data-closed-notice]', CHECK = '[data-closed="check"]', COPY = '[data-closed="copy"]';
      /* No rule here is about how fast a page boots: DOMContentLoaded, never the `load` event, and the machine's time (alpha-windows' BOOTED note). */
      const landOnNotice = async (page) => {
        await page.goto(base + '/play.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await wait(page, () => document.querySelector('form[data-auth="sign-in"]'), null, 60000);
        await page.fill('input[name=email]', 'qa@example.test');
        await page.fill('input[name=password]', 'not-a-real-password');
        await page.click('.auth-submit');
        return wait(page, (q) => document.querySelector(q), NOTICE, 30000);
      };
      const lineOf = (page) => page.evaluate((q) => document.querySelector(q + ' .auth-message').textContent, NOTICE);
      const o = { closed: true, heroes: {}, created: [] };
      const { ctx, page, errors } = await fresh(o, { width: 1366, height: 768 });
      if (!(await landOnNotice(page))) fails.push('B-7 the closed answer did not show the closed notice');
      else if (notice) {
        const said = await page.evaluate((q) => document.querySelector(q).innerText, NOTICE);
        if (!/invite-only right now/i.test(said) || !/signed up/i.test(said) || !/whoever invited you/i.test(said)) fails.push('B-7 the notice does not say what is going on and what to do: ' + JSON.stringify(said));
        if (!said.includes(UID)) fails.push('B-7 the notice does not show the account id: ' + JSON.stringify(said));
        if (/qa@example\.test/.test(said)) fails.push('B-7 the notice shows more of the account than its id');

        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
        await page.click(COPY);
        await wait(page, (q) => document.querySelector(q + ' .auth-message').textContent !== '', NOTICE, 3000);
        const copied = await page.evaluate(() => navigator.clipboard.readText());
        if (copied !== UID) fails.push('B-7 Copy put ' + JSON.stringify(copied) + ' on the clipboard, want the account id');
        if (!/^Copied/.test(await lineOf(page))) fails.push('B-7 Copy did not say it copied: ' + JSON.stringify(await lineOf(page)));
        /* A clipboard that refuses: said, and the id left selected to copy by hand. */
        await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('refused')); document.execCommand = () => false; getSelection().removeAllRanges(); });
        await page.click(COPY);
        await wait(page, (q) => /blocked/.test(document.querySelector(q + ' .auth-message').textContent), NOTICE, 3000);
        if (!/blocked/.test(await lineOf(page))) fails.push('B-7 a refused copy did not say why: ' + JSON.stringify(await lineOf(page)));
        if ((await page.evaluate(() => String(getSelection()))) !== UID) fails.push('B-7 a refused copy did not leave the id selected');

        /* Check again: off while it asks, a no says why, no answer says so. */
        const offAtPress = await page.evaluate((q) => { const b = document.querySelector(q); b.click(); return b.disabled; }, CHECK);
        if (!offAtPress) fails.push('B-7 Check again stayed on while it asked');
        await wait(page, (q) => !document.querySelector(q).disabled, CHECK, 4000);
        if (!/not on the list yet/.test(await lineOf(page))) fails.push('B-7 a no does not say why: ' + JSON.stringify(await lineOf(page)));
        o.down = true;
        await page.click(CHECK);
        await wait(page, (q) => !document.querySelector(q).disabled, CHECK, 4000);
        if (!/didn't answer/.test(await lineOf(page))) fails.push('B-7 a failed check reads as ' + JSON.stringify(await lineOf(page)));
        o.down = false;
        if (await page.$('form[data-auth="sign-in"]')) fails.push('B-7 a check landed on the sign-in screen');

        /* Added on the server: the next check goes on to the characters, signed in all along. */
        o.closed = false;
        await page.click(CHECK);
        if (!(await wait(page, () => document.querySelector('[data-app="create"][data-slot="0"]'), null, 30000))) fails.push('B-7 once admitted, Check again did not reach the characters: ' + JSON.stringify((await page.evaluate(() => document.body.innerText)).slice(0, 160)));
        if (await page.$('form[data-auth="sign-in"]')) fails.push('B-7 once admitted, the account has to sign in again');
      }
      const bad = errors.filter((e) => !/Failed to load resource/.test(e));   // the refused and the dropped reads above are the browser's own lines
      if (bad.length) fails.push('B-7 console errors: ' + bad.slice(0, 3).join(' | '));
      await ctx.close();

      if (notice) for (const vp of [{ width: 1366, height: 768 }, { width: 922, height: 423 }, { width: 667, height: 375 }]) {
        const s = await fresh({ closed: true }, vp);
        if (!(await landOnNotice(s.page))) fails.push('B-7 no notice at ' + vp.width + 'x' + vp.height);
        else {
          const off = await s.page.evaluate(([q]) => Array.from(document.querySelectorAll(q + ' button, ' + q + ' a, ' + q + ' .auth-id-value')).filter((n) => { const r = n.getBoundingClientRect();
            return r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight; }).map((n) => n.textContent.trim().slice(0, 16)), [NOTICE]);
          if (off.length) fails.push('B-7 at ' + vp.width + 'x' + vp.height + ' these run off the screen: ' + off.join(', '));
          const small = await s.page.evaluate((q) => Array.from(document.querySelectorAll(q + ' *')).filter((n) => n.childNodes.length && n.textContent.trim() && parseFloat(getComputedStyle(n).fontSize) < 12).length, NOTICE);
          if (small) fails.push('B-7 at ' + vp.width + 'x' + vp.height + ': text under 12 px');
          await s.page.click('[data-closed-notice] [data-app="sign-out"]');
          if (!(await wait(s.page, () => document.querySelector('form[data-auth="sign-in"]')))) fails.push('B-7 Sign out did not work on the notice at ' + vp.width + 'x' + vp.height);
        }
        await s.ctx.close();
      }
    }
  } catch (e) {
    if (e !== STOP) throw e;
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
  ['one 503 stops the page again (B-19)', 'src/platform/load-shell.js', 'if (!win.HearthriseRetryLoad()) sayFailed();', 'sayFailed();'],
  ['the page reloads for ever (B-19)', 'src/platform/load-shell.js', 'if (spent >= RETRY_PAUSES.length) return null;', 'if (spent >= 99) return null;\n      spent = 0;'],
  ['the reloads are spent and nothing is said (B-19)', 'src/platform/load-shell.js', '  function sayFailed() {\n', '  function sayFailed() {\n    return;\n'],
  ['the words stand with no press (B-19)', 'src/platform/load-shell.js', '    shell.appendChild(again);\n', ''],
  ['the press is painted but takes no click (B-19)', 'src/styles/app.css', '.boot-shell-again { pointer-events: auto; ', '.boot-shell-again { '],
  ['the press cannot be seen with no image (B-19)', 'src/styles/app.css', 'border: 0; background: var(--gold); color: var(--bg-0); font-family: var(--f-ui); font-size: var(--t-body); font-weight: 700; cursor: pointer; }', 'border: 0; background: none; color: var(--bg-0); cursor: pointer; }'],
  ['a third party\'s failure reloads the page (B-19)', 'src/platform/load-shell.js', "if (url.indexOf(win.location.origin) !== 0 || !/\\.js(\\?|$)/.test(url)) return;", 'if (!/\\.js(\\?|$)/.test(url)) return;'],
  ['a failure behind the first screen reloads under the player (B-19)', 'src/platform/load-shell.js', [['    if (!shell.parentNode) return;\n    if (!win.HearthriseRetryLoad', '    if (!win.HearthriseRetryLoad'], ['if (failed || !t || !shell.parentNode || (t.tagName', 'if (failed || !t || (t.tagName']]],
  ['the World\'s module gets no second go (B-19)', 'src/app/world-pane.js', "reloading = typeof win.HearthriseRetryLoad === 'function' && win.HearthriseRetryLoad();", 'void win;'],
  ['a script that fails before the store is up is lost (B-19)', 'src/platform/load-shell.js', "if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', failedNow); else failedNow();", 'failedNow();'],
  ['the page paints no loading shell', 'play.html', '<p class="boot-shell-line">Loading Hearthrise…</p>', ''],
  ['a made hero\'s press asks the server again', 'src/app/hero-create.js', "    if (made) { enter(); return; }\n", ''],
  ['Enter town comes back live under a slow town', 'src/app/hero-create.js', "    hold('Entering town…');\n", ''],
  ['a lost answer\'s retry gets a new key', 'src/app/hero-create.js', "    if (!tried || tried.name !== name) tried =", '    tried ='],
  ['a sign-up sent keeps its fields', 'src/styles/app.css', '.auth-card.is-sent .auth-field, .auth-card.is-sent .auth-submit { display: none; }\n', ''],
  ['the sign-in says nothing of the game', 'src/styles/app.css', '.auth:has(.auth-card[data-auth]) .auth-pitch { display: block; }\n', ''],
  ['Enter town runs under the fold at 1366x768', 'src/styles/app.css', '.auth:has(.auth-card.is-create) .auth-brand { display: none; }\n', ''],
  ['the color strips are gone though the world draws them', 'src/data/outfits.js', 'export const HERO_DYES_SHOWN = true;', 'export const HERO_DYES_SHOWN = false;'],
  ['no hero slot is offered', 'src/app/slot-offer.js', "  if (!offer || !purse || actor === null || anEmptySlot(roster)) return '';", "  return '';"],
  ['the oldest hero answer is the purse', 'src/app/slot-offer.js', '    if (!best || v > best.v) best = { gold: r.gold, v };', '    if (!best || v < best.v) best = { gold: r.gold, v };'],
  ['the buy button stays lit while buying', 'src/app/slot-offer.js', "(o.pending || short > 0 ? ' disabled' : '')", "(short > 0 ? ' disabled' : '')"],
  ['a hero short of gold can press buy', 'src/app/slot-offer.js', "(o.pending || short > 0 ? ' disabled' : '')", "(o.pending ? ' disabled' : '')"],
  ['a bought slot is not re-read', 'src/app/boot.js', "if (r.ok) { track('hero_slot_bought'); await showCharacters(", "if (r.ok) { track('hero_slot_bought'); drawSlotOffer(); void ("],
  ['the notice page boots the app', 'index.html', '</body>', '<script type="module" src="src/app/boot.js?v=1"></script></body>'],
  ['the strip\'s tools ride behind the hero tabs (B-4)', 'src/styles/app.css', '.char-strip-tools { display: flex; align-items: stretch; flex: none; margin-left: auto; }', '.char-strip-tools { display: flex; align-items: stretch; flex: none; }'],
  ['signing out shows the next hero (B-5)', 'src/session/account-session.js', 'this._chars.size && !this._ending ? this.characters()[0].slot : null;', 'this._chars.size ? this.characters()[0].slot : null;'],
  ['signing out keeps the chat until the heroes close (B-5)', 'src/session/account-session.js',
    "    if (this.social) { this.social.destroy(); this.social = null; }\n    for (const slot of Array.from(this._chars.keys())) this.close(slot);",
    "    for (const slot of Array.from(this._chars.keys())) this.close(slot);\n    if (this.social) { this.social.destroy(); this.social = null; }"],
  ['sign-out leaves the session copies', 'src/net/auth.js', '      for (const k of store.keys()) if (k === cfg.authKey', '      for (const k of []) if (k === cfg.authKey'],
  ['the world pane never mounts the shell', 'src/app/world-pane.js', "  shell = mountShell(stage, {", "  shell = { onInset: () => () => {}, paint() {}, destroy() {} }; void ({"],
  ['"not confirmed" offers no new link (B-6)', 'src/app/sign-in.js', 'offerResend(!!r.unconfirmed);', ''],
  ['every refusal offers a new link (B-6)', 'src/app/sign-in.js', 'offerResend(!!r.unconfirmed);', 'offerResend(true);'],
  ['the typed email is lost between the screens (B-6)', 'src/app/sign-in.js', "on, val('email'));", 'on);'],
  ['a dead email link says nothing (B-6)', 'src/app/boot.js', 'if (m) m.textContent = AUTH_COPY.linkExpired;', ''],
  ['a dead email link stays in the address (B-6)', 'src/app/boot.js', "    if (badLink) win.history.replaceState(null, '', win.location.pathname + win.location.search);\n", ''],
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
  ['the bare domain strands an invited player (N-1)', 'index.html', '<a class="notice-signin" href="play.html">Have an invite? Sign in</a>', ''],
  ['the closed notice shows no account id (B-7)', 'src/app/closed-notice.js', "esc(o.id || '')", "''"],
  ['Copy copies something else (B-7)', 'src/app/closed-notice.js', "writeText(value)", "writeText('')"],
  ['a refused copy leaves nothing selected (B-7)', 'src/app/closed-notice.js', "  select();\n  try { return win.document.execCommand", "  try { return win.document.execCommand"],
  ['Check again stays lit while it asks (B-7)', 'src/app/closed-notice.js', "    check.disabled = true;\n", ''],
  ['a no reads as no answer (B-7)', 'src/app/closed-notice.js', "say(SAY[answer] || SAY.unanswered);", "say(SAY.unanswered);"],
  ['a failed read reads as a no (B-7)', 'src/session/account-session.js', "return ans.closed ? 'closed' : ans.ok ? 'in' : 'unanswered';", "return ans.ok ? 'in' : 'closed';"],
  ['an admitted account stays on the notice (B-7)', 'src/app/closed-notice.js', "if (answer === 'in') { o.win.location.reload(); return; }", ''],
  ['the account id runs off a phone (B-7)', 'src/styles/app.css', "flex: 1 1 18em; min-height: 36px;", "flex: 0 0 40em; min-height: 36px;"],
  ['the away stamp is not written on hide (B-17)', 'src/app/boot.js', 'if (alerts && doc.hidden) alerts.leaving({ hidden: true });', ''],
  ['the away stamp is not written on page leave (B-17)', 'src/app/boot.js', "win.addEventListener('pagehide', () => { if (alerts) alerts.leaving(); });", ''],
  ['the away stamp goes on a fetch the closing page cancels (B-17)', 'src/shell/alerts.js', 'cs.flushResidue({ keepalive: true, hidden })', 'cs.flushResidue({ hidden })'],
  ['only the away stamp is flushed on the way out, a pending Got it is lost to the reload (B-18)', 'src/shell/alerts.js', '{ stampAway(cs, true); cs.flushResidue({ keepalive: true, hidden }).catch(() => {}); }', '{ if (stampAway(cs, true)) cs.flushResidue({ keepalive: true, hidden }).catch(() => {}); }'],
  ['the keepalive never reaches the fetch (B-17)', 'src/session/server.js', '...(keep && body.length < KEEPALIVE_MAX_BYTES ? { keepalive: true } : {}),', ''],
  ['only the viewed hero is stamped on the way out (B-17)', 'src/shell/alerts.js', 'for (const cs of account.characters()) { stampAway(cs, true);', 'for (const cs of account.characters().slice(0, 1)) { stampAway(cs, true);'],
  ['the away stamp is written every minute again (B-17)', 'src/shell/away-recap.js', 'export const STAMP_EVERY_MS = AWAY_MIN_MS;', 'export const STAMP_EVERY_MS = 60000;'],
  ['the town\'s sheets wait for Play again', 'src/app/boot.js', "    import('../world/prewarm.js?v=", "    Promise.resolve({ prewarmTown() {} }, '../world/prewarm.js?v="],
  ["a signed-out account's prewarm runs on (B-15)", 'src/world/prewarm.js', 'live: () => !run.stopped && alive() };', 'live: () => !run.stopped };'],
  ['the World fetches a prewarmed sheet again', 'src/render/images.js', '  let ready = HELD.get(url);\n  if (ready) return ready;', '  let ready = null;'],
  ['the World downloads every sheet on Play', 'src/world/world-boot.js', '    const sets = await setsOf(id);\n    if (!viewSheets.opensOnView(id)) await sheets.ensure(sets);',
    '    await setsOf(id);\n    await sheets.ensure(Array.from(new Set(Object.keys(book.sprites).map((sid) => book.frame(sid).set))));'],
  ['the town waits for all its sheets again (B-21)', 'src/world/world-boot.js', '    if (!viewSheets.opensOnView(id)) await sheets.ensure(sets);', '    await sheets.ensure(sets);'],
  ['the first view asks before the server names its stand (B-21)', 'src/world/view-sheets.js', 'if (!waited && town && !town.placeOn(now.id)) {', 'if (false) {'],
  ['the sheets behind the view are never asked for (B-21)', 'src/world/view-sheets.js', '    sheets.ensure(needs.get(id));\n', ''],
  ['a frame asks for the sheets of the town start while the first view waits for its stand (B-21)', 'src/world/view-sheets.js', 'const held = (id, cast) => (opening ? opensOnView(id) : check(id, cast));', 'const held = check;'],
  ['the frame loop runs while the first view waits (B-21)', 'src/world/view-sheets.js', 'sheets.ensure([set]).then(() => { if (!opening) wake(); });', 'sheets.ensure([set]).then(wake);'],
  ['a sheet whose decode never settles holds the town shut (B-21, live v0.2.106)', 'src/render/images.js', 'return Promise.race([img.decode(), new Promise((late) => win.setTimeout(late, DECODE_WAIT_MS))]);', 'return img.decode();'],
  ['a read that never answers holds the town shut (B-21)', 'src/world/view-sheets.js', 'await Promise.race([town.heard(), new Promise((done) => win.setTimeout(done, PLACE_WAIT_MS))]);', 'await new Promise(() => {});'],
  ['a shadow off the view holds the town for its sheet (B-21, v0.2.97: the Weighhouse plaque under the hearth view)', 'src/world/render/canvas-backend.js', " && sh.sprite.set && meets(castBox(sh.sprite, sh.m))) ", ' && sh.sprite.set) '],
  ['a frame naming a sheet on its way is drawn anyway (B-21)', 'src/world/view-sheets.js', 'return miss.length > 0;', 'return false;'],
  ['a failed sheet ends the town instead of drawing stubs (B-21)', 'src/world/atlas.js', "(e) => { console.warn('[world] atlas \"' + set + '\" did not load; its sprites draw as stubs', e && e.message); return false; })", '(e) => { throw e; })'],
  ['a scene shows before its sheets arrive', 'src/world/world-boot.js', "could not be prepared', e));\n      }\n      return null;",
    "could not be prepared', e));\n      }"],
  ['a closed pane still draws a sheet that lands late', 'src/world/world-boot.js', '    if (gone) return;\n    if (panel', '    if (panel'],
  /* B-20: the Privacy Policy and the Terms from the sign-in screens */
  ['the sign-up says nothing of the Terms or the Privacy Policy (B-20)', 'src/app/sign-in.js', "(LEGAL_LINE[mode] || '')", "''"],
  ['the reader takes the form away, and what was typed with it (B-20)', 'src/app/legal-reader.js', '  box.appendChild(host);\n', "  box.innerHTML = '';\n  box.appendChild(host);\n"],
  ['the server link reads any path it is given (B-20)', 'src/session/server.js', 'if (!LEGAL_PATHS.includes(path)) return null;', ''],
  ['the reader cannot be closed with Escape (B-20)', 'src/app/legal-reader.js', "if (e.key === 'Escape') { e.preventDefault(); shut(); return; }", ''],
  ['the reader does not give the focus back (B-20)', 'src/app/legal-reader.js', "if (opener && typeof opener.focus === 'function' && opener.isConnected) opener.focus();", ''],
  ['the reader shows the owner\'s notes to players (B-20)', 'src/app/legal-reader.js', ".replace(/<!--[\\s\\S]*?-->/g, '')", ''],
  ['the reader is wider than a phone (B-20)', 'src/styles/app.css', '.auth-card.auth-doc-card { width: min(46rem, 100%);', '.auth-card.auth-doc-card { width: 46rem;'],
  ['the reader\'s words are under 12 px (B-20)', 'src/styles/app.css', 'padding: 4px 6px 4px 0; font-size: var(--t-small);', 'padding: 4px 6px 4px 0; font-size: 11px;'],
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
    const fails = await checks({ [file]: text }, /\(B-1[78]\)/.test(name), /\(B-7\)/.test(name), /\(B-19\)|cannot load/.test(name), { stopAtFirst: true });
    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  console.log(bad ? 'client-boot --mutate: ' + bad + ' escaped' : 'client-boot --mutate: ' + chosen.length + '/' + chosen.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}
main();
