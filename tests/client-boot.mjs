#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/client-boot.mjs — THE TWO PAGES, BOOTED IN A REAL CHROMIUM.
//
//   node tests/client-boot.mjs           the boot checks
//   node tests/client-boot.mjs --mutate  every planted defect must turn a check RED
//
// mutant-anchors: src/app/boot.js src/app/world-pane.js src/net/auth.js index.html
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
//        a pushed frame reaches that character's pane without an error
//   B-4  a second character opens beside the first (two topics, one strip)
//   B-5  sign out -> the sign-in screen, and no copy of the session is left in
//        localStorage or sessionStorage (auth key, sb-*, the tab id)
//   B-6  a password-reset link (#type=recovery) opens the set-new-password screen
//   B-7  a 403 hr_closed answer shows the closed notice, not the game
//   B-8  a hunting character (tests/fixtures/hunt-envelope.json) mounts the hunt
//        screen's panels (top bar, party, analyzer, bottom bar) with zero console
//        errors; the rules of each panel are tests/hunt-screen.mjs
//   B-9  ONE HERO, TWO SLOTS (Tyler live 10-18: no way to create a character; ruling
//        10-17: every account starts with two): the screen names the hero and its
//        Level, the empty owned slot offers Create character, Create is ONE
//        hr_create_character for that slot and plays it, and after a reload both
//        heroes list by name
//   B-10 A SESSION THAT ENDS UNDER THE GAME (live 2026-10-20: a dead token sent 805 times):
//        every call answers 401 and the refresh is refused -> the sign-in screen with
//        "You were signed out. Sign in again.", no session copy left, and the dead
//        session sends no more than a handful of calls
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, UID, serve, SDK_STUB } from './_client-harness.mjs';

/* account.max_concurrent is the server's concurrent limit (AccountSession.limit): without it one character plays. */
function envelope(slot, version, extra) {
  return Object.assign({ ok: true, version, now: '2026-10-17T00:00:00Z', state: { active_kind: 'idle', gold: 0 }, skills: {}, inventory: {}, hero_slots: [0, 1], account: { max_concurrent: 4 } }, extra || {});
}

const HUNT = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/hunt-envelope.json'), 'utf8'));

async function stubServer(page, o) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const url = r.request().url();
    const body = JSON.parse(r.request().postData() || '{}');
    if (o.revoked) { o.dead++; return r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'UNAUTHORIZED_ASYMMETRIC_JWT' }) }); }
    if (o.closed) return r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 'hr_closed', message: 'closed' }) });
    if (o.heroes) {   // a stateful account: { slot: name } heroes; hr_create_character adds one
      const name = url.split('?')[0].split('/').pop();
      if (name === 'hr_create_character') { o.created.push(body.p_slot); o.heroes[body.p_slot] = 'New hero'; return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, slot: body.p_slot, created: true }) }); }
      const slot = name === 'hr_load' ? body.p_slot : body.slot;
      if (name === 'hr_load' || name === 'hr-accrue') {
        const b = o.heroes[slot] ? envelope(slot, 1, { name: o.heroes[slot], state: { active_kind: 'idle', gold: 0, level_xp: 21591 } })
          : { ok: false, error: 'no_character', hero_slots: [0, 1] };
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
      if (n.scripts.some((s) => !/^src\/platform\/sw-killswitch\.js\?v=\d[\d.]*$/.test(String(s)))) fails.push('N-1 the notice page loads an app script: ' + n.scripts.join(', '));
      const hs = await page.request.get(base + '/prototypes/hunt-sim/');
      if (hs.status() !== 200) fails.push('N-1 /prototypes/hunt-sim/ answered ' + hs.status());
      if (errors.length) fails.push('N-1 console errors: ' + errors.join(' | '));
      await ctx.close();
    }

    { // B-1 .. B-5
      const { ctx, page, errors } = await fresh();
      await page.goto(base + '/play.html', { waitUntil: 'load' });
      if (!(await wait(page, () => document.querySelector('form[data-auth="sign-in"]')))) fails.push('B-1 no sign-in screen');
      await page.fill('input[name=email]', 'qa@example.test');
      await page.fill('input[name=password]', 'not-a-real-password');
      await page.click('.auth-submit');
      if (!(await wait(page, () => document.querySelectorAll('[data-app="play"]').length === 2))) fails.push('B-2 the characters screen did not list the two owned slots');
      await page.click('[data-app="play"][data-slot="0"]');
      if (!(await wait(page, () => document.querySelector('#panel-world[data-slot="0"] .world-stage canvas') && document.querySelector('.hs-shell')))) fails.push('B-3 the World pane or the shell did not mount');
      const pushed = await page.evaluate((uid) => { const t = 'hr:' + uid + ':0'; if (!window.__hub.channels[t]) return 'no topic ' + t;
        window.__hub.send(t, { t: 'delta', frame: 3, patch: { state: { active_kind: 'idle', gold: 5 } } }); return 'ok'; }, UID);
      if (pushed !== 'ok') fails.push('B-3 ' + pushed);
      await page.click('[data-app="characters"]');
      if (!(await wait(page, () => document.querySelector('[data-app="play"][data-slot="1"]')))) fails.push('B-4 no way back to the characters screen');
      else {
        await page.click('[data-app="play"][data-slot="1"]');
        const two = await wait(page, (uid) => document.querySelectorAll('.char-tab[data-app="show"]').length === 2
          && window.__hub.channels['hr:' + uid + ':0'] && window.__hub.channels['hr:' + uid + ':1']
          && document.querySelector('#panel-world[data-slot="1"]'), UID);
        if (!two) fails.push('B-4 a second character did not open beside the first');
      }
      await page.click('[data-app="sign-out"]');
      if (!(await wait(page, () => document.querySelector('form[data-auth="sign-in"]')))) fails.push('B-5 sign-out did not return to sign-in');
      const left = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)]
        .filter((k) => k === 'hr-auth' || k.startsWith('hr-auth-') || k.startsWith('sb-') || k === 'hr-tab-id' || k === 'hearthrise:supabaseSession'));
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

    { // B-9 one hero, two owned slots: name + level, Create character, both after a reload
      const o = { heroes: { 0: 'Tester' }, created: [] };
      const { ctx, page, errors } = await fresh(o);
      await page.goto(base + '/play.html', { waitUntil: 'load' });
      await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
      await page.fill('input[name=email]', 'qa@example.test');
      await page.fill('input[name=password]', 'not-a-real-password');
      await page.click('.auth-submit');
      await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
      const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.char-row')).map((li) => li.textContent.replace(/\s+/g, ' ').trim()));
      if (rows.length !== 2 || !/^Tester Level 10 ?Play$/.test(rows[0]) || !/Create character$/.test(rows[1]) || !(await page.$('[data-app="create"][data-slot="1"]')))
        fails.push('B-9 one hero and an empty owned slot list as ' + JSON.stringify(rows));
      else {
        await page.click('[data-app="create"][data-slot="1"]');
        const played = await wait(page, () => document.querySelector('#panel-world[data-slot="1"]'));
        if (JSON.stringify(o.created) !== '[1]' || !played) fails.push('B-9 Create sent ' + JSON.stringify(o.created) + (played ? '' : ' and did not play the new hero'));
        await page.reload({ waitUntil: 'load' });
        await wait(page, () => document.querySelectorAll('[data-app="play"]').length === 2 || document.querySelector('.hs-launchers'));
        if (!(await page.$('[data-app="play"][data-slot="1"]'))) { await page.click('[data-app="characters"]').catch(() => {}); await wait(page, () => document.querySelectorAll('[data-app="play"]').length === 2); }
        const after = await page.evaluate(() => Array.from(document.querySelectorAll('.char-row .char-name')).map((n) => n.textContent.replace(/\s+/g, ' ').trim()));
        if (after.length !== 2 || !/^Tester/.test(after[0]) || !/^New hero/.test(after[1])) fails.push('B-9 after a reload the heroes list as ' + JSON.stringify(after));
      }
      if (errors.length) fails.push('B-9 console errors: ' + errors.slice(0, 3).join(' | '));
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
      /* a frame that skips versions makes the character ask the engine (hr-accrue) */
      await page.evaluate((uid) => { window.__refuseRefresh = true; window.__hub.send('hr:' + uid + ':0', { t: 'delta', frame: 9, patch: { state: { active_kind: 'idle', gold: 9 } } }); }, UID);
      const out = await wait(page, () => document.querySelector('form[data-auth="sign-in"]') && /You were signed out\. Sign in again\./.test(document.body.innerText));
      if (!out) fails.push('B-10 a refused refresh did not land on sign-in with "You were signed out. Sign in again."');
      await page.waitForTimeout(1500);
      if (o.dead > 3) fails.push('B-10 the dead session sent ' + o.dead + ' calls');
      const left = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((k) => k === 'hr-auth' || k === 'hr-tab-id'));
      if (out && left.length) fails.push('B-10 session copies left after the session ended: ' + left.join(', '));
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
  ['the notice page boots the app', 'index.html', '</body>', '<script type="module" src="src/app/boot.js?v=1"></script></body>'],
  ['sign-out leaves the session copies', 'src/net/auth.js', '      for (const k of store.keys()) if (k === cfg.authKey', '      for (const k of []) if (k === cfg.authKey'],
  ['the world pane never mounts the shell', 'src/app/world-pane.js', "  shell = mountShell(stage, {", "  shell = { onInset: () => () => {}, paint() {}, destroy() {} }; void ({"],
  ['the recovery link is ignored', 'src/app/boot.js', [["if (ev === 'recovery') showAuth('set-password');", "if (ev === 'nothing') showAuth('set-password');"],
    ['const recovering = /type=recovery/.test(win.location.hash);', 'const recovering = false;']]],
  ['the hunt panels never mount', 'src/data/hud-widgets.js', 'min: Object.freeze([320, 64]), opacity: 1, visible: true', 'min: Object.freeze([320, 64]), opacity: 1, visible: false'],
  ['every hero is "Character N" again', 'src/app/boot.js', "(r.exists ? esc(r.name || 'Unnamed hero')", "(r.exists ? 'Character ' + (r.slot + 1)"],
  ['an empty owned slot offers no Create', 'src/app/boot.js', 'class="auth-submit" data-app="create" data-slot="', 'class="auth-submit" data-app="nothing" data-slot="'],
  ['a dead session stays in the game', 'src/app/boot.js', "else if (ev === 'signed-out' || ev === 'expired') sessionEnded();", "else if (ev === 'signed-out') sessionEnded();"],
  ['the closed answer is ignored', 'src/app/boot.js', "if (why === 'closed-game') showClosed();", "if (why === 'never') showClosed();"],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'client-boot: ' + fails.length + ' check(s) RED' : 'client-boot: both pages boot; sign-in, play, two characters, one hero + Create in the second slot, sign-out, a dead session, reset and closed all hold');
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
