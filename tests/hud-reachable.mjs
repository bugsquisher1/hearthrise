#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hud-reachable.mjs — EVERY PANEL AND WINDOW STAYS IN REACH AT EVERY DESKTOP SIZE; THE AWAY CARD TELLS THE TRUTH AND BLOCKS NOTHING.
//
//   node tests/hud-reachable.mjs                 the rules
//   node tests/hud-reachable.mjs --mutate        every planted defect must turn a named rule RED
//   node tests/hud-reachable.mjs --mutate --only <words>   only the mutants whose name holds <words>
//   node tests/hud-reachable.mjs --shots <dir>   also write a screenshot per size, solo and in a party of 4
//
// mutant-anchors: src/shell/shell.js src/shell/hud-room.js src/shell/hud.js src/shell/window-manager.js src/shell/away-recap.js src/shell/alerts.js src/styles/hunt.css
// mutant-writes-tree: no — page mutants are served overrides
//
// Three friends' panel, 2026-11-01 (art/review/player-feedback-2026-11-01/friends.txt on lane/f3-friends): below about 1550 px
// wide and 820 px tall the Hunt analyzer started 5 px above the window's foot, in a party the Party panel too, on a page that
// does not scroll: no friends' HP, no XP per hour, no Remove. play.html with supabase-js and the REST paths stubbed
// (tests/_client-harness.mjs), on tests/fixtures/hunt-envelope.json. The sizes are the panel's, plus the smallest and the commonest.
//   HR-1 ON SCREEN (each size, solo and a party of 4, resized live): every shown widget lies inside the window; no two World panels overlap
//   HR-2 IN REACH (the same): every member's HP and mana, every Remove, Leave party and Disband, the analyzer's fold and its XP
//        per hour each come into view by scrolling their own panel and take a press there; the page itself never scrolls
//   HR-3 THE BAR STAYS HOME (the same; Tyler 10-22): it is centred, a tall panel neither slides nor pushes it
//   HR-4 A PANEL THE PLAYER MOVED (saved in the residue at 1920x1080, folded to its title in the corner the bar then clears):
//        at a smaller window its title is on screen and takes a press, never behind the bar
//   HR-5 WINDOWS (each size): every window's head and close are on screen and take a press. Two docked at 1920x1080 and a float
//        dragged to the far corner stay in reach when the window shrinks to 1024x600, and go back to their places when it grows
//   HR-6 THE ALERTS BLOCK NOTHING (each size, solo and a party of 4, Chat open): the card and its button are on screen and pressable
//        beside the Party panel and the Chat window, every Chat tab and the Party panel's presses take theirs; a full screen of
//        windows leaves it waiting hidden, and it comes back when one closes
//   HR-7 THE AWAY CARD FOLLOWS THE SERVER (CLAUDE.md §6): "Still hunting" with the stamina of the envelope now, replaced by the next
//        one; the hunt ending or another starting takes the card away, on screen and after a reload. A card about a hunt that ended
//        while away keeps saying so, with the stamina now
//   HR-8 THE PHONE KEEPS ITS OWN RULES (922x423): no desktop room is written on the Party panel or the alerts
//   HR-9 A HUNT IN VIEW IS NOT AN ABSENCE: past the stamp's age with the page open, no "While you were away"
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ROOT, UID, serve, SDK_STUB } from './_client-harness.mjs';
import { judge, report, exitOf, cleanControl } from './_mutant-verdict.mjs';

const FIXTURE = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/hunt-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const LOAD_MS = 20000;
const SIZES = [[1280, 720], [1366, 650], [1440, 780], [1536, 730], [1024, 600], [1920, 1080]];
const HOURS = 3600000;
const PARTY_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

/* A party of 4 with the leader viewing, as the server projects it: the hunt's numbers and the membership share the `party` section. */
function partyOf4(env) {
  const extra = [
    { unit: 3, seat: 2, name: 'Solace', level: 20, weapon: 'staff', hp: 90, hp_max: 110, mana: 80, mana_max: 140, stamina_ms: 27000000, dealt: 400, healed: 2100, dps: 2, hps: 14 },
    { unit: 4, seat: 3, name: 'Sorrel', level: 19, weapon: 'shield', hp: 140, hp_max: 180, mana: 20, mana_max: 40, stamina_ms: 26000000, dealt: 900, healed: 0, dps: 5, hps: 0 },
  ];
  env.party.members.push(...extra);
  env.party.id = PARTY_ID;
  env.party.max = 4;
  env.party.hunt = env.hunt.hunt_id;
  env.party.leave_together = true;
  for (const m of env.party.members) { m.hunting = true; m.hero_slot = 0; }
  env.hunt.pose.units.push({ u: 3, side: 'hero', x: 9, y: 10 }, { u: 4, side: 'hero', x: 11, y: 10 });
  return env;
}

function scripted(prep) {
  const s = { env: clone(FIXTURE), version: 1 };
  if (prep) prep(s.env);
  s.next = () => Object.assign(clone(s.env), { version: ++s.version });
  return s;
}

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load') return json(s.next());
    if (name === 'hr-accrue') return json(Object.assign({ accrued: true }, s.next()));
    /* The server keeps what hr_put_client_state sends and hands it back in every envelope (as hr_state_of does). */
    if (name === 'hr_put_client_state') { s.env.client_state = Object.assign({}, s.env.client_state, body.p_patch); return json({ ok: true }); }
    return json({ ok: true });
  });
}

const wait = (page, fn, arg, ms = LOAD_MS) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

async function signIn(page, base) {
  await page.goto(base + '/play.html', { waitUntil: 'load' });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"], [data-app="play"][data-slot="0"], .hb-bar'));
  if (await page.$('form[data-auth="sign-in"]')) {
    await page.fill('input[name=email]', 'qa@example.test');
    await page.fill('input[name=password]', 'not-a-real-password');
    await page.click('.auth-submit');
  }
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"], .hb-bar'));
  if (await page.$('[data-app="play"][data-slot="0"]')) await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('.hb-bar') && document.querySelector('[data-hs-widget="analyzer"]') && document.querySelector('.hp-m'));
}

/* The next envelope, delivered as a frame (the game's own push), applied when this returns. */
async function pushEnvelope(page, s) {
  await page.evaluate(([uid, e]) => window.__hub.send('hr:' + uid + ':0', { t: 'state', frame: e.version, env: e }), [UID, s.next()]);
  await page.waitForTimeout(150);
}

/* Layout has settled when two reads a frame apart agree. */
async function settle(page) {
  await page.evaluate(() => new Promise((ok) => {
    let last = '', same = 0, n = 0;
    const read = () => Array.from(document.querySelectorAll('[data-hs-widget], .hs-win')).map((e) => { const q = e.getBoundingClientRect(); return [q.left, q.top, q.width, q.height].join(); }).join(';');
    const tick = () => { const now = read(); same = now === last ? same + 1 : 0; last = now; if (same >= 3 || ++n > 120) ok(); else requestAnimationFrame(tick); };
    tick();
  }));
}

/* Does a press at this element's middle land on it, once its own panel scrolled it into view? A page function. */
const PRESS_LANDS = `(sel, root) => {
  const scope = root ? document.querySelector(root) : document;
  return Array.from(scope ? scope.querySelectorAll(sel) : []).filter((e) => e.offsetWidth).map((e) => {
    e.scrollIntoView({ block: 'nearest' });
    const q = e.getBoundingClientRect();
    const x = q.left + q.width / 2, y = q.top + q.height / 2;
    const on = x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight;
    const hit = on ? document.elementFromPoint(x, y) : null;
    return { what: (e.getAttribute('aria-label') || e.textContent || e.className).trim().slice(0, 40), ok: !!hit && (hit === e || e.contains(hit) || hit.contains(e)), at: [Math.round(x), Math.round(y)], on: hit ? String(hit.className).slice(0, 40) : 'off the window' };
  });
}`;
const presses = (page, sel, root) => page.evaluate(`(${PRESS_LANDS})(${JSON.stringify(sel)}, ${JSON.stringify(root || null)})`);
const scrollBack = (page) => page.evaluate(() => { for (const e of document.querySelectorAll('.hp-party .hh-panel-body, .ha-scroll')) e.scrollTop = 0; });

/** Every widget's box, by id. */
const boxes = (page) => page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('[data-hs-widget]')).filter((e) => e.offsetWidth && e.offsetHeight && getComputedStyle(e).visibility !== 'hidden').map((e) => {
  const q = e.getBoundingClientRect(); return [e.getAttribute('data-hs-widget'), { left: q.left, top: q.top, right: q.right, bottom: q.bottom, world: !!e.closest('[data-hs-hud="world"]') }];
})));
const crossing = (p, q) => p.left < q.right - 1 && p.right > q.left + 1 && p.top < q.bottom - 1 && p.bottom > q.top + 1;

async function checks(overrides, shots, { stopAtFirst = false } = {}) {
  const fails = [];
  if (stopAtFirst) fails.push = function (...a) { Array.prototype.push.apply(this, a); throw STOP; };
  const { server, port } = await serve(overrides);
  const base = 'http://127.0.0.1:' + port;
  const browser = await leaseBrowser(chromium);
  const open = async (prep, viewport = { width: 1920, height: 1080 }) => {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const s = scripted(prep);
    await stub(page, s);
    const up = await signIn(page, base);
    return { ctx, page, s, up, errors };
  };
  const size = async (page, w, h) => { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(60); await settle(page); };
  try {
    /* HR-1, HR-2, HR-3: the panels, each size, solo and a party of 4, resized live as a player drags a window narrower. */
    for (const [tag, prep] of [['solo', null], ['party of 4', partyOf4]]) {
      const { ctx, page, up, errors } = await open(prep);
      if (!up) { fails.push('HR-1 ' + tag + ': the screen did not mount'); await ctx.close(); continue; }
      const seats = tag === 'solo' ? 2 : 4;
      if (!(await wait(page, (n) => document.querySelectorAll('.hp-m').length === n, seats))) fails.push('HR-2 ' + tag + ': the fixture shows ' + (await page.evaluate(() => document.querySelectorAll('.hp-m').length)) + ' seats, not ' + seats);
      if (tag !== 'solo') {
        /* The expanded board is the tallest one a player can make: the DPS and HPS lines on. */
        await page.evaluate(() => { const b = Array.from(document.querySelectorAll('.hp-party button')).find((x) => /DPS and HPS/.test(x.textContent)); if (b) b.click(); });
      }
      for (const [w, h] of SIZES) {
        const at = tag + ' ' + w + 'x' + h;
        await size(page, w, h);
        await scrollBack(page);
        const b = await boxes(page);
        for (const k of ['party', 'analyzer', 'action-bar', 'hunt-topbar']) if (!b[k]) fails.push('HR-1 ' + at + ': the ' + k + ' panel is not shown');
        for (const [k, q] of Object.entries(b)) {
          if (q.top < 0 || q.left < 0 || q.bottom > h + 0.5 || q.right > w + 0.5) fails.push('HR-1 ' + at + ': ' + k + ' runs off the window: ' + JSON.stringify([q.left, q.top, q.right, q.bottom].map(Math.round)));
        }
        const world = Object.entries(b).filter(([, q]) => q.world);
        for (let i = 0; i < world.length; i++) for (let j = i + 1; j < world.length; j++) {
          if (crossing(world[i][1], world[j][1])) fails.push('HR-1 ' + at + ': ' + world[i][0] + ' and ' + world[j][0] + ' overlap');
        }
        if (await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1)) fails.push('HR-2 ' + at + ': the page itself scrolls');
        const needed = ['.hp-m .hh-gauge.is-hp', '.hp-m .hh-gauge.is-mana', '.ha-analyzer .hs-wfold', '.ha-stats [data-stat="xp_h"], .ha-stats [data-stat="kills"]', '.hb-plaque .hh-step button'];
        if (tag !== 'solo') needed.push('.hp-kick', '.hp-acts button');
        /* A player scrolls with a wheel: a board cut off by its room must move under one. */
        const cut = await page.evaluate(() => { const e = document.querySelector('.hp-party .hh-panel-body'); if (!e || e.scrollHeight <= e.clientHeight + 1) return null; const q = e.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; });
        if (cut) {
          await page.mouse.move(cut[0], cut[1]);
          await page.mouse.wheel(0, 200);
          if (!(await wait(page, () => document.querySelector('.hp-party .hh-panel-body').scrollTop > 0, null, 2000))) fails.push('HR-2 ' + at + ': the Party panel does not move under a wheel');
          await scrollBack(page);
        }
        for (const sel of needed) {
          const got = await presses(page, sel);
          if (!got.length) fails.push('HR-2 ' + at + ': nothing shows ' + sel);
          for (const g of got) if (!g.ok) fails.push('HR-2 ' + at + ': "' + g.what + '" (' + sel + ') cannot be reached: at ' + g.at + ' lies ' + g.on);
        }
        await scrollBack(page);
        const bar = b['action-bar'];
        if (bar && Math.abs((bar.left + bar.right) / 2 - w / 2) > 1) fails.push('HR-3 ' + at + ': the action bar slid off its centre to ' + Math.round(bar.left));
        if (shots) await page.screenshot({ path: join(shots, tag.replace(/ /g, '') + '-' + w + 'x' + h + '.png') });
      }
      /* Shorter than any size we promise, where a panel's own minimum outgrows its room: it may touch the bar, it never leaves the window. */
      await size(page, 1100, 430);
      const low = await presses(page, '.ha-analyzer .hs-wfold');
      if (!low.length || !low[0].ok) fails.push('HR-3 ' + tag + ' 1100x430: the bar pushed the analyzer off the window: ' + JSON.stringify(low[0] || null));
      if (errors.length) fails.push('HR-1 ' + tag + ': page errors: ' + errors.slice(0, 2).join(' | '));
      await ctx.close();
    }

    { // HR-4 a panel the player moved
      const moved = { desktop: { analyzer: { anchor: 'bl', dx: 12, dy: 12, folded: true }, tally: { anchor: 'br', dx: 12, dy: 0 } } };
      const { ctx, page, up } = await open((env) => { env.client_state = Object.assign({}, env.client_state, { hudLayout: moved }); });
      if (up) {
        if (!(await page.evaluate(() => { const q = document.querySelector('[data-hs-widget="analyzer"]').getBoundingClientRect(); return q.left < 40 && q.bottom > innerHeight - 40; }))) fails.push('HR-4 CONTROL: the saved place did not land in the corner at 1920x1080');
        for (const [w, h] of SIZES) {
          await size(page, w, h);
          const t = await presses(page, '.ha-analyzer .hs-wfold');
          if (!t.length || !t[0].ok) fails.push('HR-4 ' + w + 'x' + h + ': the moved, folded analyzer\'s title cannot be pressed: ' + JSON.stringify(t[0] || null));
          const b = await boxes(page);
          if (b.analyzer && b['action-bar'] && crossing(b.analyzer, b['action-bar'])) fails.push('HR-4 ' + w + 'x' + h + ': the moved analyzer lies on the action bar');
        }
        /* open at the smallest: the moved panel still ends above the bar */
        await page.click('.ha-analyzer .hs-wfold');
        await size(page, 1024, 600);
        const b = await boxes(page);
        if (b.analyzer && b['action-bar'] && crossing(b.analyzer, b['action-bar'])) fails.push('HR-4 1024x600: the moved analyzer, opened, lies on the action bar');
        if (b.analyzer && b.analyzer.top < 0) fails.push('HR-4 1024x600: the moved analyzer, opened, starts off the top');
      } else fails.push('HR-4 the screen did not mount');
      await ctx.close();
    }

    { // HR-5 a wide saved Chat beside a four-seat panel at the smallest size: no column clears, its head stays in reach
      const { ctx, page, up } = await open((env) => { partyOf4(env); env.client_state = Object.assign({}, env.client_state, { winSize: { chat: [900, 400] } }); }, { width: 1024, height: 600 });
      if (up) {
        await page.keyboard.press('Enter');
        await wait(page, () => document.querySelector('[data-hs-win="chat"] .hs-win-head'));
        await settle(page);
        const close = await presses(page, '.hs-win-head .hs-close', '[data-hs-win="chat"]');
        if (!close.length || !close[0].ok) fails.push('HR-5 a wide Chat at 1024x600 has no head to press: ' + JSON.stringify(close[0] || null));
        const tall = await page.evaluate(() => document.querySelector('[data-hs-win="chat"]').getBoundingClientRect().height);
        if (tall < 100) fails.push('HR-5 a wide Chat at 1024x600 is a ' + Math.round(tall) + ' px sliver');
      } else fails.push('HR-5 the wide Chat screen did not mount');
      await ctx.close();
    }

    { // HR-5 windows
      const { ctx, page, up } = await open();
      if (up) {
        const ids = await page.$$eval('[data-hs-open]', (els) => els.map((e) => e.getAttribute('data-hs-open')));
        if (ids.length < 8) fails.push('HR-5 CONTROL: only ' + ids.length + ' launchers');
        for (const [w, h] of [[1024, 600], [1366, 650]]) {
          await size(page, w, h);
          for (const id of ids) {
            await page.click('[data-hs-open="' + id + '"]');
            if (!(await wait(page, (i) => document.querySelector('[data-hs-win="' + i + '"]'), id, 5000))) { fails.push('HR-5 ' + id + ' did not open at ' + w + 'x' + h); continue; }
            await settle(page);
            for (const g of await presses(page, '.hs-win-head .hs-close, .hs-win-head [data-hs-close]', '[data-hs-win="' + id + '"]')) {
              if (!g.ok) fails.push('HR-5 ' + w + 'x' + h + ': ' + id + '\'s close cannot be pressed: at ' + g.at + ' lies ' + g.on);
            }
            const q = await page.evaluate((i) => { const e = document.querySelector('[data-hs-win="' + i + '"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right, bottom: r.bottom }; }, id);
            if (!q) { fails.push('HR-5 ' + w + 'x' + h + ': window ' + id + ' closed by itself'); continue; }
            if (q.top < 0 || q.left < 0 || q.right > w + 0.5 || q.bottom > h + 0.5) fails.push('HR-5 ' + w + 'x' + h + ': window ' + id + ' runs off the window: ' + JSON.stringify(q));
            await page.click('[data-hs-open="' + id + '"]');
            await wait(page, (i) => !document.querySelector('[data-hs-win="' + i + '"]'), id, 5000);
          }
        }
        /* two docked and one floated at the far corner, then the window shrinks */
        await size(page, 1920, 1080);
        const docked = ['inventory', 'character'].filter((id) => ids.includes(id));
        for (const id of docked) { await page.click('[data-hs-open="' + id + '"]'); await wait(page, (i) => document.querySelector('[data-hs-win="' + i + '"]'), id, 5000); }
        await settle(page);
        const heads = () => page.evaluate((list) => list.map((i) => { const r = document.querySelector('[data-hs-win="' + i + '"]').getBoundingClientRect(); return { i, left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top) }; }), docked);
        const wide = await heads();
        await size(page, 1024, 600);
        for (const q of await heads()) if (q.left < 0 || q.right > 1024) fails.push('HR-5 a docked window runs off a smaller window: ' + JSON.stringify(q));
        await size(page, 1920, 1080);
        if (JSON.stringify(await heads()) !== JSON.stringify(wide)) fails.push('HR-5 the docked windows did not go back when the window grew: ' + JSON.stringify([wide, await heads()]));
        for (const id of docked) await page.click('[data-hs-open="' + id + '"]');
        await wait(page, (l) => l.every((i) => !document.querySelector('[data-hs-win="' + i + '"]')), docked, 5000);
        await page.click('[data-hs-open="inventory"]');
        await wait(page, () => document.querySelector('[data-hs-win="inventory"] .hs-win-head'), null, 5000);
        await settle(page);
        const hb = await page.locator('[data-hs-win="inventory"] .hs-win-head').boundingBox();
        await page.mouse.move(hb.x + 120, hb.y + 16);
        await page.mouse.down();
        await page.mouse.move(1700, 1000, { steps: 6 });
        await page.mouse.up();
        await settle(page);
        const far = await page.locator('[data-hs-win="inventory"]').boundingBox();
        if (!(far.y > 800)) fails.push('HR-5 CONTROL: the float did not land in the far corner: ' + JSON.stringify(far));
        await size(page, 1024, 600);
        const near = await presses(page, '.hs-win-head .hs-close, .hs-win-head [data-hs-close]', '[data-hs-win="inventory"]');
        if (!near.length || !near[0].ok) fails.push('HR-5 a float at the far corner is out of reach in a smaller window: ' + JSON.stringify(near[0] || null));
        await size(page, 1920, 1080);
        const back = await page.locator('[data-hs-win="inventory"]').boundingBox();
        if (Math.abs(back.x - far.x) > 1 || Math.abs(back.y - far.y) > 1) fails.push('HR-5 the float did not go back to its place when the window grew: ' + JSON.stringify([far, back]));
      } else fails.push('HR-5 the screen did not mount');
      await ctx.close();
    }

    /* A stamp two hours old: the first envelope raises the away card. */
    const stamped = (env, extra = {}) => {
      env.client_state = Object.assign({}, env.client_state, { awaySeen: { s: env.hunt.session_id, at: env.hunt_server_now_ms - 2 * HOURS, xp: Math.max(0, env.state.level_xp - 500), gold: 0, kills: 1 } }, extra);
    };

    for (const [tag, prep] of [['solo', null], ['party of 4', partyOf4]]) { // HR-6 the alerts block nothing
      const { ctx, page, up } = await open((env) => { if (prep) prep(env); stamped(env); });
      if (up) {
        if (!(await wait(page, () => /While you were away/.test(document.querySelector('.hw-alert-text')?.textContent || '')))) fails.push('HR-6 CONTROL ' + tag + ': no away card came up');
        await page.keyboard.press('Enter');
        await wait(page, () => document.querySelector('[data-hs-win="chat"] [role="tab"]'));
        await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
        for (const [w, h] of SIZES) {
          const at = tag + ' ' + w + 'x' + h;
          await size(page, w, h);
          await scrollBack(page);
          const card = await page.evaluate(() => { const e = document.querySelector('[data-hs-widget="alerts"]'); const q = e.getBoundingClientRect(); return { left: q.left, top: q.top, right: q.right, bottom: q.bottom, hidden: getComputedStyle(e).visibility === 'hidden' }; });
          const others = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-widget="party"], [data-hs-widget="analyzer"], [data-hs-widget="tally"], [data-hs-widget="action-bar"], [data-hs-widget="hunt-topbar"], .hs-win:not(.is-leaving)')).filter((e) => e.offsetWidth && getComputedStyle(e).visibility !== 'hidden').map((e) => { const q = e.getBoundingClientRect(); return { n: e.getAttribute('data-hs-widget') || e.getAttribute('data-hs-win'), left: q.left, top: q.top, right: q.right, bottom: q.bottom }; }));
          if (!card.hidden) {
            for (const q of others) if (crossing(card, q)) fails.push('HR-6 ' + at + ': the away card lies over ' + q.n);
            if (card.top < 0 || card.bottom > h || card.left < 0 || card.right > w) fails.push('HR-6 ' + at + ': the away card runs off the window');
            for (const g of await presses(page, '.hw-alert-do, .hw-alert-x')) if (!g.ok) fails.push('HR-6 ' + at + ': the card\'s "' + g.what + '" cannot be pressed: at ' + g.at + ' lies ' + g.on);
          } else if (w >= 1280) fails.push('HR-6 ' + at + ': the card waits hidden with room on the screen');
          for (const g of await presses(page, '[role="tab"]', '[data-hs-win="chat"]')) if (!g.ok) fails.push('HR-6 ' + at + ': the Chat tab "' + g.what + '" cannot be pressed: at ' + g.at + ' lies ' + g.on);
          for (const g of await presses(page, '.hp-m .hh-gauge.is-hp')) if (!g.ok) fails.push('HR-6 ' + at + ': a friend\'s health cannot be reached: at ' + g.at + ' lies ' + g.on);
          await scrollBack(page);
        }
        /* No free row (a wide window docked over all that is left): the card waits hidden, and comes back when the window closes. */
        await size(page, 1024, 600);
        await page.click('[data-hs-open="hunts"]');
        await wait(page, () => document.querySelector('[data-hs-win="hunts"]'), null, 5000);
        await settle(page);
        const under = await page.evaluate(() => { const e = document.querySelector('[data-hs-widget="alerts"]'), q = e.getBoundingClientRect(), w = document.querySelector('[data-hs-win="hunts"]').getBoundingClientRect();
          return { hidden: getComputedStyle(e).visibility === 'hidden', over: q.left < w.right && q.right > w.left && q.top < w.bottom && q.bottom > w.top }; });
        if (under.over && !under.hidden) fails.push('HR-6 ' + tag + ': the card lies over the Hunts window at 1024x600');
        await page.click('[data-hs-open="hunts"]');
        await wait(page, () => !document.querySelector('[data-hs-win="hunts"]'), null, 5000);
        await settle(page);
        if (await page.evaluate(() => getComputedStyle(document.querySelector('[data-hs-widget="alerts"]')).visibility === 'hidden') && !(await page.evaluate(() => document.querySelector('[data-hs-win="chat"]')))) fails.push('HR-6 ' + tag + ': the card stayed hidden after the window closed');
      } else fails.push('HR-6 ' + tag + ': the screen did not mount');
      await ctx.close();
    }

    { // HR-7 the away card follows the server
      const { ctx, page, s, up } = await open((env) => stamped(env));
      if (up) {
        const line = () => page.evaluate(() => Array.from(document.querySelectorAll('.hw-alert-text')).map((e) => e.textContent).find((t) => /While you were away/.test(t)) || null);
        if (!(await wait(page, () => /While you were away/.test(document.querySelector('.hw-alert-text')?.textContent || '')))) fails.push('HR-7 CONTROL: no away card came up');
        const first = await line();
        if (!/Still hunting, with 7 h 43 min of stamina left\./.test(first || '')) fails.push('HR-7 CONTROL: the first line is ' + JSON.stringify(first));
        /* the next envelope's stamina replaces the number */
        s.env.stamina = Object.assign({}, s.env.stamina, { ms: 5 * HOURS });
        await pushEnvelope(page, s);
        if (!(await wait(page, () => /Still hunting, with 5 h 0 min of stamina left\./.test(document.querySelector('.hw-alert-text')?.textContent || ''), null, 5000))) fails.push('HR-7 the card keeps the stamina it came up with: ' + JSON.stringify(await line()));
        if ((await line() || '').replace(/Still hunting.*$/, '') !== (first || '').replace(/Still hunting.*$/, '')) fails.push('HR-7 what happened while away changed: ' + JSON.stringify([first, await line()]));
        /* the hunt ends: no line says it is still hunting; the summary is the notice now */
        s.env.hunt = Object.assign({}, s.env.hunt, { ended: true, session: Object.assign({}, s.env.hunt.session, { end_reason: 'stamina', ended_at: new Date(s.env.hunt_server_now_ms).toISOString() }) });
        await pushEnvelope(page, s);
        if (!(await wait(page, () => !/While you were away/.test(Array.from(document.querySelectorAll('.hw-alert-text')).map((e) => e.textContent).join(' ')), null, 5000))) fails.push('HR-7 the hunt ended and the card still says: ' + JSON.stringify(await line()));
        if (/Still hunting/.test(await page.evaluate(() => document.body.innerText))) fails.push('HR-7 "Still hunting" is on screen after the hunt ended');
        await page.reload({ waitUntil: 'load' });
        await wait(page, () => document.querySelector('.hb-bar'));
        await page.waitForTimeout(400);
        if (/Still hunting/.test(await page.evaluate(() => document.body.innerText))) fails.push('HR-7 "Still hunting" came back on a reload');
      } else fails.push('HR-7 the screen did not mount');
      await ctx.close();
      /* A hunt that ended while away keeps its card, with the stamina of each envelope. */
      const ended = await open((env) => {
        stamped(env);
        env.hunt.ended = true;
        env.hunt.session = Object.assign({}, env.hunt.session, { end_reason: 'stamina', ended_at: new Date(env.hunt_server_now_ms - HOURS).toISOString() });
        env.stamina = Object.assign({}, env.stamina, { ms: 2 * HOURS, hunting: false });
      });
      if (await wait(ended.page, () => /The hunt has ended/.test(document.querySelector('.hw-alert-text')?.textContent || ''))) {
        ended.s.env.stamina = Object.assign({}, ended.s.env.stamina, { ms: 3 * HOURS });
        await pushEnvelope(ended.page, ended.s);
        if (!(await wait(ended.page, () => /Stamina now: 3 h 0 min\./.test(document.querySelector('.hw-alert-text')?.textContent || ''), null, 5000))) fails.push('HR-7 the card about an ended hunt keeps an old stamina: ' + JSON.stringify(await ended.page.evaluate(() => document.querySelector('.hw-alert-text')?.textContent)));
      } else fails.push('HR-7 CONTROL: a hunt that ended while away raised no card: ' + JSON.stringify(await ended.page.evaluate(() => document.querySelector('.hw-alert-text')?.textContent || null)));
      await ended.ctx.close();
    }

    { // HR-9 a hunt in view is never an absence: the clock passes the stamp's age with the page open, no card; the stamp renews
      const { ctx, page, s, up } = await open((env) => { env.client_state = Object.assign({}, env.client_state, { awaySeen: { s: env.hunt.session_id, at: env.hunt_server_now_ms - 596000, xp: env.state.level_xp, gold: 0, kills: 1 } }); });
      if (up) {
        /* the stamp turns ten minutes old with the page open */
        await page.waitForTimeout(9000);
        await pushEnvelope(page, s);
        await page.waitForTimeout(300);
        const shown = await page.evaluate(() => Array.from(document.querySelectorAll('.hw-alert-text')).map((e) => e.textContent).join(' | '));
        if (/While you were away/.test(shown)) fails.push('HR-9 a hunt on screen says "While you were away": ' + shown);
      } else fails.push('HR-9 the screen did not mount');
      await ctx.close();
    }

    { // HR-8 the phone keeps its own rules
      const { ctx, page, up } = await open((env) => { partyOf4(env); stamped(env); }, { width: 922, height: 423 });
      if (await wait(page, () => document.querySelector('.hb-bar') && document.querySelector('.hp-m'))) {
        await settle(page);
        const room = await page.evaluate(() => ['party', 'alerts'].map((id) => { const e = document.querySelector('[data-hs-widget="' + id + '"]'); return e ? e.style.getPropertyValue('--hs-room') : ''; }));
        if (room.some(Boolean)) fails.push('HR-8 the phone reads a desktop room: ' + JSON.stringify(room));
      } else fails.push('HR-8 the phone screen did not mount (' + up + ')');
      await ctx.close();
    }
  } catch (e) {
    if (e !== STOP) throw e;
  } finally {
    await browser.close();
    server.closeAllConnections();
    server.close();
  }
  return fails;
}

const STOP = Symbol('first red');

const MUTANTS = [
  ['the bar steps a tall panel below itself again (HR-3)', 'src/shell/shell.js', "if (!phoneMq.matches && anchorOf(e)[0] !== 't') continue;", ''],
  ['a panel gets no room above the bar (HR-1)', 'src/shell/hud-room.js', 'take(e, panelRoom(moved ? Object.assign(q, { top: 0 }) : q, bars, height, gap));', ''],
  ['the Party panel ignores its room (HR-1)', 'src/styles/hunt.css', '.hp-party { width: 250px; max-height: var(--hs-room, none); }', '.hp-party { width: 250px; }'],
  ['the Party panel does not scroll (HR-2)', 'src/styles/hunt.css', '.hp-party .hh-panel-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }', '.hp-party .hh-panel-body { min-height: 0; overflow: hidden; }'],
  ['the room is measured from where a slid bar is (HR-3)', 'src/shell/hud-room.js', 'const bars = phone ? els.filter(isBar).map(rel) : barsAtHome();', 'const bars = [];'],
  ['a moved panel lies behind the bar (HR-4)', 'src/shell/hud-room.js', 'if (top !== Math.round(q.top)) e.style.top = top', 'if (false) e.style.top = top'],
  ['a docked window keeps its slot off a smaller window (HR-5)', 'src/shell/window-manager.js', 'return Math.max(DOCK_EDGE, Math.min(r, world().width - width(id) - DOCK_EDGE));', 'return r;'],
  ['a float keeps its place off a smaller window (HR-5)', 'src/shell/window-manager.js', 'return { x: Math.max(0, Math.min(w.width - width(id), f.x)), y: Math.max(0, Math.min(w.height - 48, f.y)) };', 'return { x: f.x, y: f.y };'],
  ['a Chat with no room is a sliver (HR-5)', 'src/shell/shell.js', "Math.max(at.max, RESIZE_MIN.h) + 'px'", "at.max + 'px'"],
  ['a browser resize does not repaint the windows (HR-5)', 'src/shell/shell.js', 'function onResize() { paintWindows(); paintWidgets(); }', 'function onResize() { paintWidgets(); }'],
  ['the alerts stay in the left column over Chat and the party (HR-6)', 'src/shell/hud-room.js', 'if (left !== null) { alerts.style.left = left + \'px\'; way.push(Object.assign(q, { left })); }', ''],
  ['the alerts ignore the windows in their row (HR-6)', 'src/shell/hud-room.js', "return panels.concat(Array.from(layer.querySelectorAll('.hs-win:not(.is-leaving)'))).map(rel);", 'return panels.map(rel);'],
  ['the card with no room stays over the window (HR-6)', 'src/shell/hud-room.js', "alerts.classList.toggle('is-under-dock', left === null);", ''],
  ['the away card keeps the line it came up with (HR-7)', 'src/shell/alerts.js', 'const line = a.kind === \'away\' ? awayLineNow(cs, a) : a.text;', 'const line = a.text;'],
  ['the away card stays after the hunt ended (HR-7)', 'src/shell/away-recap.js', 'if (!h || h.sessionId !== a.session || (h.ended && !a.ended)) return null;', 'if (!h || h.sessionId !== a.session) return null;'],
  ['a hunt in view is judged as an absence (HR-9)', 'src/shell/alerts.js', 'if (judged && awaySettled(cs)) returning.delete(cs.slot);', ''],
  ['the desktop\'s room reaches the phone (HR-8)', 'src/shell/hud-room.js', 'if (phone) { if (!room.has(e)) room.set(e, null); continue; }', ''],
];

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'hud-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null, shots);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'hud-reachable: ' + fails.length + ' rule(s) RED' : 'hud-reachable: every panel and window in reach at ' + SIZES.length + ' desktop sizes, solo and in a party of 4; the away card follows the server and blocks nothing');
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await cleanControl(() => checks(null, null));
  console.log(clean.line);
  if (clean.code) process.exit(clean.code);
  const counts = { caught: 0, harness: 0, escaped: 0 };
  const only = process.argv.indexOf('--only') > 0 ? process.argv[process.argv.indexOf('--only') + 1] : null;
  for (const [name, file, from, to] of MUTANTS) {
    if (only && !name.includes(only)) continue;
    const text = await readFile(join(ROOT, file), 'utf8');
    if (!text.includes(from)) { console.log('  ✗ ' + name + ' — HARNESS: anchor not found in ' + file); counts.harness++; continue; }
    console.log(report(name, await judge(() => checks({ [file]: text.replace(from, to) }, null, { stopAtFirst: true })), counts));
  }
  console.log(exitOf(counts) ? 'hud-reachable --mutate: ' + counts.escaped + ' escaped, ' + counts.harness + ' HARNESS (not catches)' : 'hud-reachable --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught, each by a named rule');
  process.exit(exitOf(counts));
}

main().catch((e) => { console.error(e); process.exit(2); });
