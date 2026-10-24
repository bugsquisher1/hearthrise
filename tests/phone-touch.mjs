#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/phone-touch.mjs — THE PHONE: SHEETS THAT FIT, PANELS THAT CLOSE, TARGETS A THUMB CAN HIT.
//
//   node tests/phone-touch.mjs                the rules
//   node tests/phone-touch.mjs --mutate       every planted defect must turn a rule RED
//   node tests/phone-touch.mjs --shots <dir>  also write the visual-gate screenshots (667x375, 844x390,
//                                             922x423, portrait 390x844 and desktop 1440x900, fonts loaded)
//
// mutant-anchors: src/styles/hunt.css src/styles/windows.css src/styles/shell.css src/styles/app.css play.html src/shell/windows/configure-action.js src/shell/widgets/hunt-topbar.js src/shell/widgets/analyzer.js src/shell/windows/settings.js src/data/hud-widgets.js
// mutant-writes-tree: no — page mutants are served overrides
//
// QA's phone playtest (2026-10-24) scored mobile 4/10. play.html with supabase-js and the REST paths stubbed
// (tests/_client-harness.mjs): tests/fixtures/hunt-envelope.json in a hunt, tests/fixtures/alpha-envelope.json
// in town. Phones are landscape (CLAUDE.md §1, §7); the phone query is the frozen one.
//   PH-1 CONFIGURE ACTION FITS (667x375, 844x390, 922x423): on the Spells and the Items tab the list scrolls
//        inside the sheet until its LAST row is on screen and pressable, while Save, Cancel and the close stay
//        on screen and pressable; a new tab's list starts at its first row; the column heads sit over their own
//        columns (the head's cells line up with the rows' cells, none wraps to a second line); the page itself
//        never pans sideways
//   PH-2 HUNT DETAILS IS A TOGGLE, THE ANALYZER CLOSES, AND NEITHER TRAPS THE HUNT BAR (844x390, 667x375):
//        Hunt details shows the analyzer (pressed) and a second press hides it; the analyzer has its own close;
//        open, it never crosses the hunt bar or the action bar; closed stays closed after a reload, open comes
//        back clear of the hunt bar; a pending leave ("Leaving in Ns") stands where Leave hunt was and keeps the
//        hunt bar on one line, inside the screen and off the Party panel (on screen: a party of two ends above the
//        action bar). At 1440x900 the analyzer shows by default and the same toggle works
//   PH-3 PORTRAIT: a touch phone held upright (390x844, 375x812) sees ONE full-screen "turn your phone
//        sideways" card on top of everything, its words >= 12 px; a phone in landscape, a touch tablet either
//        way up and a desktop (a narrow window included) never see it
//   PH-4 SETTINGS BY TOUCH (844x390): a press on a toggle's words flips its box; every toggle's pressable
//        line is >= 44 px tall; the Window opacity slider's own target is >= 44 px tall
//   PH-5 TOUCH TARGETS (844x390): the Shop's Buy, the hunt bar's buttons and the analyzer's tabs are >= 40 px
//        tall; an item's tooltip fits the screen whole (nothing cut off); with a long bag, the picked item's
//        Equip is on screen and pressable without scrolling
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';

const clone = (o) => JSON.parse(JSON.stringify(o));
const HUNT = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/hunt-envelope.json'), 'utf8'));
const ALPHA = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
/* The scene plays huntPlaybackDelayMs behind the server (src/session/config.js), as tests/hunt-screen.mjs states it. */
HUNT.hunt_server_now_ms += (await import(pathToFileURL(join(ROOT, 'src/session/config.js')).href)).SESSION_CONFIG.huntPlaybackDelayMs;
const { ITEMS } = await import(pathToFileURL(join(ROOT, 'src/data/items.js')).href);
/* A long bag (the playtest's hero carried 42 stacks): thirty more stacks of plain materials. */
const MATERIALS = Object.keys(ITEMS).filter((id) => !ITEMS[id].kind && !ITEMS[id].type && !(id in ALPHA.inventory)).slice(0, 30);
/* The town prep: that long bag, and a tool and a piece of gear for sale (the Shop sells no supplies, AW-7). */
function longBag(env) {
  for (const id of MATERIALS) env.inventory[id] = 3;
  env.shop = Object.assign({}, env.shop, { offers: env.shop.offers.concat([{ offer: 'supply.bronze_axe', item: 'bronze_axe', kind: 'tool', price: 120 },
    { offer: 'supply.leather_gloves', item: 'leather_gloves', kind: 'gear', price: 160 }]) });
}

const PHONES = [{ width: 667, height: 375 }, { width: 844, height: 390 }, { width: 922, height: 423 }];
const tagOf = (vp) => vp.width + 'x' + vp.height;
const LOAD_MS = 15000;
const wait = (page, fn, arg, ms = LOAD_MS) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

function scripted(fixture, prep) {
  /* Like the real server, the residue a put stores comes back in every later envelope (client_state). */
  const s = { env: clone(fixture), version: 1, calls: [], residue: {} };
  if (prep) prep(s.env);
  s.next = () => Object.assign(clone(s.env), { version: ++s.version, client_state: clone(s.residue) });
  return s;
}

async function stub(page, s, fonts) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  /* Shots load the real faces (a judgement needs them); the rules run on the fallbacks, offline. */
  if (!fonts) await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load') return json(s.next());
    if (name === 'hr-accrue') return json(Object.assign({ accrued: true }, s.next()));
    if (name === 'hr_put_client_state') { s.residue = Object.assign({}, s.residue, body.p_patch || {}); return json({ ok: true }); }
    return json({ ok: true });
  });
}

/* Signed in and playing: the bar (and, in a hunt, the party with both heroes). A reload keeps the session. */
async function play(page, base, town) {
  if (base) await page.goto(base + '/play.html', { waitUntil: 'domcontentloaded', timeout: LOAD_MS * 2 });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"], [data-app="play"][data-slot="0"], .hb-bar'));
  if (await page.$('form[data-auth="sign-in"]')) {
    await page.fill('input[name=email]', 'qa@example.test');
    await page.fill('input[name=password]', 'not-a-real-password');
    await page.click('.auth-submit');
  }
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"], .hb-bar'));
  if (await page.$('[data-app="play"][data-slot="0"]')) await page.click('[data-app="play"][data-slot="0"]');
  if (town) return wait(page, () => document.querySelector('.hb-bar') && document.querySelectorAll('.hb-slot[data-item]').length > 0 && document.querySelector('.hs-launchers'));
  return wait(page, () => document.querySelectorAll('.hp-m').length === 2 && document.querySelector('.ht-bar'));
}

/* Rects in the viewport's px, and the plain facts every rule reads. */
const RECT = `window.__r = (q, root) => { const e = typeof q === 'string' ? (root || document).querySelector(q) : q;
  if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect();
  return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
  window.__onScreen = (r) => !!r && r.width > 0 && r.height > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5;
  window.__cross = (a, b) => !!a && !!b && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  window.__hits = (e) => { if (!e) return false; const b = e.getBoundingClientRect(); const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!t && (t === e || e.contains(t)); };`;

/* ── PH-1 ── */
async function configureFits(page, tag, fails) {
  await page.click('.hb-slot[data-slot="2"]');
  if (!(await wait(page, () => document.querySelector('[data-hs-win="configure-action"] .ca-rank')))) { fails.push('PH-1 [' + tag + '] a bar slot did not open Configure action'); return; }
  for (const tab of ['spells', 'items']) {
    await page.click('.ca-tab[data-tab="' + tab + '"]');
    if (!(await wait(page, (t) => document.querySelector('.ca-tab[data-tab="' + t + '"][aria-selected="true"]') && document.querySelectorAll('.ca-runs .ca-row').length > 3, tab, 4000))) {
      fails.push('PH-1 [' + tag + '] the ' + tab + ' tab shows no list'); continue;
    }
    /* The column heads: each shown head cell sits over the same column's cells (centre inside the cell). */
    const heads = await page.evaluate(() => Array.from(document.querySelectorAll('.ca-runs .ca-run')).map((run) => {
      const shown = (e) => getComputedStyle(e).display !== 'none' && e.getClientRects().length;
      const hc = Array.from(run.querySelectorAll('.ca-head > .ca-c')).filter(shown).map((e) => e.getBoundingClientRect());
      const row = run.querySelector('.ca-list .ca-row');
      const rc = row ? Array.from(row.querySelectorAll('.ca-c')).filter(shown).map((e) => e.getBoundingClientRect()) : [];
      const head = run.querySelector('.ca-head').getBoundingClientRect();
      const name = run.querySelector('.ca-head .ca-name').getBoundingClientRect();
      const off = hc.map((h, i) => { const r = rc[i]; const cx = h.left + h.width / 2; return r && cx >= r.left - 2 && cx <= r.right + 2 ? null : Math.round(cx); }).filter((x) => x !== null);
      const oneLine = hc.every((h) => h.top >= head.top - 0.5 && h.bottom <= head.bottom + 0.5 && Math.abs((h.top + h.bottom) / 2 - (name.top + name.bottom) / 2) < 12);
      return { run: run.getAttribute('data-run'), heads: hc.length, cells: rc.length, off, oneLine };
    }));
    for (const h of heads) {
      if (h.heads !== h.cells || h.off.length) fails.push('PH-1 [' + tag + '] ' + tab + ' / ' + h.run + ': ' + h.heads + ' head cells over ' + h.cells + ' columns, ' + h.off.length + ' off their column');
      else if (!h.oneLine) fails.push('PH-1 [' + tag + '] ' + tab + ' / ' + h.run + ': a column head wrapped below the row of heads');
    }
    /* Scroll the list the way a thumb (or a wheel) does, over its first row (or the middle of a short screen when
       that row is further down), until its last row shows. A new tab's list starts at its first row. */
    const first = await page.evaluate(() => { const r = window.__r('.ca-runs .ca-row'); return r && { x: r.left + r.width / 2, y: r.top + r.height / 2, vh: innerHeight }; });
    if (!first || first.y > first.vh) { fails.push('PH-1 [' + tag + '] ' + tab + ': the list starts below the screen'); continue; }
    if (first.y < 0) { fails.push('PH-1 [' + tag + '] ' + tab + ': the tab opened with its list scrolled past its first row'); continue; }
    await page.mouse.move(first.x, Math.min(first.y, first.vh * 0.55));
    let seen = null;
    for (let i = 0; i < 60; i++) {
      seen = await page.evaluate(() => { const rows = document.querySelectorAll('.ca-runs .ca-row'); const last = rows[rows.length - 1];
        return { on: window.__onScreen(window.__r(last)) && window.__hits(last), n: rows.length }; });
      if (seen.on) break;
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(30);
    }
    if (!seen.on) fails.push('PH-1 [' + tag + '] ' + tab + ': the last of ' + seen.n + ' rows never scrolls on screen inside the sheet');
    const keep = await page.evaluate(() => Object.fromEntries([['Save', '.ca-foot [data-x="save"]'], ['Cancel', '.ca-foot [data-x="cancel"]'], ['the close', '.ca-close']]
      .map(([k, q]) => { const e = document.querySelector(q); return [k, window.__onScreen(window.__r(e)) && window.__hits(e)]; })));
    for (const [k, ok] of Object.entries(keep)) if (!ok) fails.push('PH-1 [' + tag + '] ' + tab + ': ' + k + ' is off screen or covered with the list scrolled down');
  }
  /* The page itself never slides sideways (at 667 px a too-wide icon row let a tap pan the whole game 43 px). */
  const pan = await page.evaluate(() => { const d = document.scrollingElement; const app = document.querySelector('.app');
    return { doc: d.scrollWidth - innerWidth, left: d.scrollLeft + (app ? app.scrollLeft : 0) }; });
  if (pan.doc > 0 || pan.left) fails.push('PH-1 [' + tag + '] the page pans sideways: ' + pan.doc + ' px wider than the screen, slid ' + pan.left + ' px');
}

/* ── PH-2 ── */
const AN = `({ an: window.__r('.ha-analyzer'), bar: window.__r('.ht-bar'), hub: window.__r('.hb-bar'), party: window.__r('.hp-party'),
  pressed: (document.querySelector('[data-hs-act="details"]') || {}).getAttribute && document.querySelector('[data-hs-act="details"]').getAttribute('aria-pressed') })`;
const anState = (page) => page.evaluate((src) => (0, eval)(src), AN);
async function analyzerToggles(page, base, tag, fails, phone) {
  const details = '.ht-bar [data-hs-act="details"]';
  /* A press a thumb can make: the button on top where it is pressed (a panel over it eats the press). */
  const pressDetails = async () => { if (await page.click(details, { timeout: 2500 }).then(() => true, () => false)) return true;
    fails.push('PH-2 [' + tag + '] Hunt details cannot be pressed (something lies over it)'); return false; };
  let a = await anState(page);
  if (phone && a.an) fails.push('PH-2 [' + tag + '] the analyzer shows on a phone before Hunt details is pressed');
  if (!phone && !a.an) fails.push('PH-2 [' + tag + '] the analyzer does not show by default on a desktop');
  if (!phone) { if (!(await pressDetails())) return; await page.waitForTimeout(250); a = await anState(page); if (a.an) fails.push('PH-2 [' + tag + '] Hunt details did not hide a shown analyzer'); }
  if (!(await pressDetails())) return;
  await page.waitForTimeout(300);
  a = await anState(page);
  if (!a.an) { fails.push('PH-2 [' + tag + '] Hunt details did not show the analyzer'); return; }
  if (a.pressed !== 'true') fails.push('PH-2 [' + tag + '] Hunt details does not read pressed while the analyzer shows (' + a.pressed + ')');
  if (window_cross(a.an, a.bar)) fails.push('PH-2 [' + tag + '] the analyzer covers the hunt bar: ' + JSON.stringify([a.an, a.bar]));
  if (window_cross(a.an, a.hub)) fails.push('PH-2 [' + tag + '] the analyzer runs over the action bar: ' + JSON.stringify([a.an, a.hub]));
  if (!(await pressDetails())) return;
  await page.waitForTimeout(300);
  a = await anState(page);
  if (a.an) fails.push('PH-2 [' + tag + '] a second press on Hunt details did not hide the analyzer');
  else if (a.pressed !== 'false') fails.push('PH-2 [' + tag + '] Hunt details still reads pressed with the analyzer hidden');
  /* Its own close: the phone's (on a desktop, as every HUD panel, Hunt details and HUD layout hide it). */
  if (!phone) return;
  if (!(await anState(page)).an && !(await pressDetails())) return;
  await page.waitForTimeout(300);
  const close = await page.evaluate(() => { const b = Array.from(document.querySelectorAll('.ha-analyzer button')).find((x) => /close|hide/i.test(x.getAttribute('aria-label') || x.textContent));
    if (!b) return 'none'; const r = window.__r(b); if (!window.__onScreen(r) || !window.__hits(b)) return 'covered'; if (r.height < 40 || r.width < 40) return 'small ' + Math.round(r.width) + 'x' + Math.round(r.height); b.click(); return 'ok'; });
  await page.waitForTimeout(300);
  if (close !== 'ok') fails.push('PH-2 [' + tag + '] the analyzer has no close a thumb can press (' + close + ')');
  else if ((await anState(page)).an) fails.push('PH-2 [' + tag + '] the analyzer\'s close did not hide it');
  /* Closed stays closed after a reload; open comes back clear of the hunt bar. */
  await page.waitForTimeout(2200);   // the residue put (debounced: residueDebounceMs, 1.5 s)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: LOAD_MS * 2 });
  await play(page, null, false);
  await page.evaluate(RECT);
  await page.waitForTimeout(500);
  if ((await anState(page)).an) { fails.push('PH-2 [' + tag + '] a closed analyzer came back after a reload'); return; }
  if (!(await pressDetails())) return;
  await page.waitForTimeout(2200);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: LOAD_MS * 2 });
  await play(page, null, false);
  await page.evaluate(RECT);
  await page.waitForTimeout(600);
  a = await anState(page);
  if (!a.an) fails.push('PH-2 [' + tag + '] an open analyzer did not come back after a reload');
  else if (window_cross(a.an, a.bar)) fails.push('PH-2 [' + tag + '] after a reload the analyzer covers the hunt bar: ' + JSON.stringify([a.an, a.bar]));
}
function window_cross(a, b) { return !!a && !!b && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5; }

/* ── PH-3 ── */
async function portrait(browser, base, fails, shots) {
  const CASES = [
    { vp: { width: 390, height: 844 }, touch: true, want: true }, { vp: { width: 375, height: 812 }, touch: true, want: true },
    { vp: { width: 844, height: 390 }, touch: true, want: false }, { vp: { width: 768, height: 1024 }, touch: true, want: false },
    { vp: { width: 1024, height: 768 }, touch: true, want: false }, { vp: { width: 1440, height: 900 }, touch: false, want: false },
    { vp: { width: 390, height: 844 }, touch: false, want: false },
  ];
  for (const c of CASES) {
    const tag = tagOf(c.vp) + (c.touch ? ' touch' : ' desktop');
    const ctx = await browser.newContext({ viewport: c.vp, hasTouch: c.touch, isMobile: c.touch });
    const page = await ctx.newPage();
    const s = scripted(ALPHA);
    await stub(page, s, !!shots);
    await page.goto(base + '/play.html', { waitUntil: 'domcontentloaded', timeout: LOAD_MS * 2 });
    await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('body *')).filter((e) => /sideways/i.test(e.textContent || '') && e.children.length === 0 && e.getClientRects().length);
      const top = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      const screen = top && top.closest('[role="alert"], [role="dialog"], [aria-modal]');
      const box = screen && screen.getBoundingClientRect();
      const words = screen ? Array.from(screen.querySelectorAll('*')).filter((e) => e.childNodes.length && (e.textContent || '').trim() && e.getClientRects().length).map((e) => parseFloat(getComputedStyle(e).fontSize)) : [];
      return { shown: cards.length > 0, onTop: !!screen && /sideways/i.test(screen.textContent), full: !!box && box.left <= 0.5 && box.top <= 0.5 && box.right >= innerWidth - 0.5 && box.bottom >= innerHeight - 0.5,
        minPx: words.length ? Math.min(...words) : null };
    });
    if (c.want && !(r.shown && r.onTop && r.full)) fails.push('PH-3 [' + tag + '] a phone held upright sees no full-screen "turn sideways" card on top: ' + JSON.stringify(r));
    if (c.want && r.shown && !(r.minPx >= 12)) fails.push('PH-3 [' + tag + '] the turn-sideways card has text at ' + r.minPx + ' px');
    if (!c.want && r.shown) fails.push('PH-3 [' + tag + '] the turn-sideways card shows where it must not');
    if (shots && c.want && c.vp.width === 390) await page.screenshot({ path: join(shots, 'portrait-390x844-turn-sideways.png') });
    await ctx.close();
  }
}

/* ── PH-4 ── */
async function settingsTouch(page, tag, fails) {
  await page.keyboard.press('Escape');   // Escape opens Settings with no window open
  if (!(await wait(page, () => document.querySelector('[data-hs-win="settings"] .st-tab[data-cat="interface"]'), null, 4000))) { fails.push('PH-4 [' + tag + '] Settings did not open'); return; }
  await page.click('.st-tab[data-cat="interface"]');
  await page.waitForTimeout(250);
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('[data-page="interface"] .st-row:not([hidden])')).map((row) => {
    const c = row.querySelector('input[type="checkbox"], input[type="range"]');
    if (!c) return null;
    const labels = Array.from(c.labels || []);
    const tall = Math.max(0, ...labels.map((l) => l.getBoundingClientRect().height));
    return { id: row.getAttribute('data-row'), type: c.type, target: c.type === 'range' ? c.getBoundingClientRect().height : Math.max(tall, c.getBoundingClientRect().height), linked: labels.length > 0 };
  }).filter(Boolean));
  if (!rows.some((r) => r.type === 'checkbox')) fails.push('PH-4 [' + tag + '] no toggle on the Interface page');
  for (const r of rows) {
    if (r.type === 'checkbox' && r.target < 44) fails.push('PH-4 [' + tag + '] the ' + r.id + ' toggle can be pressed on a strip ' + Math.round(r.target) + ' px tall' + (r.linked ? '' : ' (its words are not its label)'));
    if (r.type === 'range' && r.target < 44) fails.push('PH-4 [' + tag + '] the ' + r.id + ' slider is ' + Math.round(r.target) + ' px tall to a thumb');
  }
  /* A press on the words flips the box. */
  const id = 'panel.online';
  await page.evaluate((i) => document.querySelector('[data-row="' + i + '"]').scrollIntoView({ block: 'center' }), id);
  await page.waitForTimeout(150);
  const before = await page.evaluate((i) => document.querySelector('[data-row="' + i + '"] input[type="checkbox"]').checked, id);
  const words = await page.evaluate((i) => window.__r('[data-row="' + i + '"] .st-label'), id);
  if (!words) { fails.push('PH-4 [' + tag + '] the ' + id + ' row has no words'); return; }
  await page.mouse.click(words.left + Math.min(40, words.width / 2), words.top + words.height / 2);
  await page.waitForTimeout(250);
  const after = await page.evaluate((i) => document.querySelector('[data-row="' + i + '"] input[type="checkbox"]').checked, id);
  if (after === before) fails.push('PH-4 [' + tag + '] a press on "' + id + '"\'s words did not flip its box');
}

/* ── PH-5 ── */
async function tallEnough(page, q, min, what, tag, fails) {
  const hs = await page.evaluate((s) => Array.from(document.querySelectorAll(s)).filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
    .map((e) => Math.round(e.getBoundingClientRect().height)), q);
  if (!hs.length) fails.push('PH-5 [' + tag + '] no ' + what + ' to measure');
  else if (Math.min(...hs) < min) fails.push('PH-5 [' + tag + '] ' + what + ' are ' + Math.min(...hs) + ' px tall (want >= ' + min + ')');
}
async function openKey(page, key, id) {
  for (let i = 0; i < 4 && await page.evaluate(() => document.querySelectorAll('[data-hs-win]:not(.is-leaving)').length > 0); i++) {
    await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  await page.keyboard.press(key);
  return wait(page, (w) => document.querySelector('[data-hs-win="' + w + '"] [data-hs-built]'), id, 4000);
}
async function bagByTouch(page, tag, fails) {
  if (!(await openKey(page, 'v', 'shop'))) fails.push('PH-5 [' + tag + '] V did not open the Shop');
  else { await page.waitForTimeout(250); await tallEnough(page, '[data-hs-win="shop"] [data-hs-act="buy"]', 40, 'the Shop\'s Buy buttons', tag, fails); }
  if (!(await openKey(page, 'b', 'inventory'))) { fails.push('PH-5 [' + tag + '] B did not open the Inventory'); return; }
  await page.waitForTimeout(300);
  const pocket = '.hw-pocket[data-item="iron_helm"]';
  await page.evaluate((q) => document.querySelector(q).scrollIntoView({ block: 'center' }), pocket);
  if (!(await page.click(pocket, { timeout: 2500 }).then(() => true, () => false))) { fails.push('PH-5 [' + tag + '] the iron helm cannot be pressed in the bag'); return; }
  await page.hover(pocket, { timeout: 2500 }).catch(() => null);
  await page.waitForTimeout(300);
  const tip = await page.evaluate(() => { const t = document.querySelector('.hw-tip.is-on'); if (!t) return null; const r = window.__r(t);
    return { r, on: window.__onScreen(r), cut: t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1, vh: innerHeight }; });
  if (!tip) fails.push('PH-5 [' + tag + '] the iron helm shows no tooltip');
  else if (!tip.on || tip.cut) fails.push('PH-5 [' + tag + '] the tooltip does not fit the ' + tip.vh + ' px screen whole: ' + Math.round(tip.r.height) + ' px tall' + (tip.cut ? ', cut off' : '') + ' (' + Math.round(tip.r.top) + '..' + Math.round(tip.r.bottom) + ')');
  await page.mouse.move(2, 200);
  await page.waitForTimeout(200);
  const eq = await page.evaluate(() => { const b = document.querySelector('.hw-pick.is-on .hw-primary'); if (!b) return 'none'; return window.__onScreen(window.__r(b)) && window.__hits(b) ? 'ok' : 'off screen ' + JSON.stringify(window.__r(b)); });
  if (eq !== 'ok') fails.push('PH-5 [' + tag + '] with a long bag the picked item\'s Equip is not on screen (' + eq + ')');
}

async function rules(overrides, shots, { stopAtFirst = false, blocks = null } = {}) {
  /* `blocks`: a mutant runs only the pages its rule reads (BLOCKS_OF), so --mutate costs seconds a mutant, not the suite. */
  const run = (b) => !blocks || blocks.includes(b);
  const fails = [];
  const STOP = Symbol('first red');
  if (stopAtFirst) fails.push = function (...a) { Array.prototype.push.apply(this, a); throw STOP; };
  const { server, port } = await serve(overrides);
  const base = 'http://127.0.0.1:' + port;
  const browser = await leaseBrowser(chromium);
  const opened = [];
  const open = async (vp, fixture, prep, o = {}) => {
    const ctx = await browser.newContext({ viewport: vp });
    opened.push(ctx);
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const s = scripted(fixture, prep);
    await stub(page, s, !!shots);
    const up = await play(page, base, fixture === ALPHA);
    await page.evaluate(RECT);
    await page.waitForTimeout(o.settle || 400);
    return { ctx, page, s, up, errors };
  };
  const shot = async (page, name) => { if (shots) await page.screenshot({ path: join(shots, name + '.png') }); };
  const done = async (o, tag) => { if (o.errors.length) fails.push('PH [' + tag + '] console errors: ' + o.errors.slice(0, 2).join(' | ')); await o.ctx.close(); };
  try {
    for (const vp of run('configure') ? PHONES : []) { // PH-1
      const tag = tagOf(vp);
      const o = await open(vp, HUNT);
      if (!o.up) { fails.push('PH-1 [' + tag + '] the hunt did not mount'); await o.ctx.close(); continue; }
      await configureFits(o.page, tag, fails);
      await shot(o.page, 'configure-items-scrolled-' + tag);
      await o.page.click('.ca-tab[data-tab="spells"]').catch(() => null);
      await o.page.waitForTimeout(250);
      await shot(o.page, 'configure-spells-' + tag);
      await done(o, tag);
    }
    for (const vp of run('hunt') ? [{ width: 844, height: 390 }, { width: 667, height: 375 }, { width: 1440, height: 900 }] : []) { // PH-2
      const tag = tagOf(vp);
      const phone = vp.width < 1024;
      const o = await open(vp, HUNT);
      if (!o.up) { fails.push('PH-2 [' + tag + '] the hunt did not mount'); await o.ctx.close(); continue; }
      await analyzerToggles(o.page, base, tag, fails, phone);
      if (phone) await shot(o.page, 'hunt-analyzer-open-' + tag);
      await done(o, tag);
      if (!phone) continue;
      /* A pending leave: "Leaving in Ns" to the server's leave_at (90 s off on the hunt's server clock,
         hunt_server_now_ms: the fixture's `now` is a year from it), the button off. */
      const leaving = await open(vp, HUNT, (env) => {
        env.hunt.session = Object.assign({}, env.hunt.session, { id: env.hunt.session_id, leave_at: new Date(env.hunt_server_now_ms + 90000).toISOString(), phase: 'leaving' });
      });
      if (!leaving.up) { fails.push('PH-2 [' + tag + '] the leaving hunt did not mount'); await leaving.ctx.close(); continue; }
      const l = await leaving.page.evaluate(() => ({ line: (document.querySelector('.ht-leaving') || {}).textContent, bar: window.__r('.ht-bar'), party: window.__r('.hp-party'),
        rows: (() => { const tops = Array.from(document.querySelectorAll('.ht-bar > *')).filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none' && (e.textContent || '').trim())
          .map((e) => { const b = e.getBoundingClientRect(); return Math.round(b.top + b.height / 2); }); return new Set(tops.map((t) => Math.round(t / 12))).size; })(),
        /* every shown word of the bar inside the bar, and the bar on screen */
        spill: Array.from(document.querySelectorAll('.ht-bar > *')).filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none' && (e.textContent || '').trim())
          .map((e) => e.getBoundingClientRect()).filter((b) => b.right > Math.min(innerWidth, document.querySelector('.ht-bar').getBoundingClientRect().right) + 1).length,
        /* the countdown stands where Leave hunt was: the button (off until the hunt ends) takes no room beside it */
        leaveShown: (() => { const b = document.querySelector('.ht-bar [data-hs-act="leave"]'); return !!b && b.getClientRects().length > 0; })() }));
      if (!/^Leaving in \d+s$/.test(String(l.line))) fails.push('PH-2 [' + tag + '] CONTROL: the pending leave shows "' + l.line + '"');
      else if (!(l.party && l.party.bottom <= vp.height && l.party.top >= 0)) fails.push('PH-2 [' + tag + '] CONTROL: the Party panel is not on screen (' + JSON.stringify(l.party) + ')');
      else if (window_cross(l.bar, l.party)) fails.push('PH-2 [' + tag + '] the leaving hunt bar runs ' + Math.round(l.party.right - l.bar.left) + ' px over the Party panel');
      else if (l.rows > 1) fails.push('PH-2 [' + tag + '] the leaving hunt bar wraps to ' + l.rows + ' lines');
      else if (l.spill) fails.push('PH-2 [' + tag + '] ' + l.spill + ' part(s) of the leaving hunt bar run past its edge or the screen\'s');
      else if (l.leaveShown) fails.push('PH-2 [' + tag + '] the switched-off Leave hunt still takes room beside "' + l.line + '"');
      await shot(leaving.page, 'hunt-leaving-' + tag);
      /* PH-5: the hunt bar's buttons and the analyzer's tabs are thumb-sized. */
      if (vp.width === 844) {
        await tallEnough(leaving.page, '.ht-bar button:not([hidden])', 40, 'the hunt bar\'s buttons', tag, fails);
        await leaving.page.click('.ht-bar [data-hs-act="details"]', { timeout: 2500 }).catch(() => null);
        await leaving.page.waitForTimeout(300);
        await tallEnough(leaving.page, '.ha-analyzer .ha-tab', 40, 'the analyzer\'s tabs', tag, fails);
      }
      await done(leaving, tag);
    }
    if (run('portrait')) await portrait(browser, base, fails, shots); // PH-3
    for (const vp of run('town') ? [{ width: 844, height: 390 }] : []) { // PH-4, PH-5 in town
      const tag = tagOf(vp);
      const o = await open(vp, ALPHA, longBag);
      if (!o.up) { fails.push('PH-4 [' + tag + '] the town did not mount'); await o.ctx.close(); continue; }
      await settingsTouch(o.page, tag, fails);
      await shot(o.page, 'settings-interface-' + tag);
      await bagByTouch(o.page, tag, fails);
      await shot(o.page, 'inventory-equip-' + tag);
      await done(o, tag);
    }
    if (shots) await moreShots(open, shot);
  } catch (e) {
    /* the array's own push: under stopAtFirst `fails.push` throws, and a throw here would leave rules() rejected */
    if (e !== STOP) Array.prototype.push.call(fails, 'PH threw: ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | '));
  } finally {
    for (const c of opened) await c.close().catch(() => null);
    await browser.close().catch(() => null);
    server.close();
  }
  return fails;
}

/* The rest of the visual gate: every touched screen at every phone size, and the desktop unchanged. */
async function moreShots(open, shot) {
  for (const vp of [...PHONES, { width: 1440, height: 900 }]) {
    const tag = tagOf(vp);
    const phone = vp.width < 1024;
    const h = await open(vp, HUNT);
    if (h.up) {
      await shot(h.page, 'hunt-' + tag);
      if (phone && vp.width === 922) {
        await h.page.click('.ht-bar [data-hs-act="details"]').catch(() => null);
        await h.page.waitForTimeout(400);
        await shot(h.page, 'hunt-analyzer-open-' + tag);
        await h.page.click('.ht-bar [data-hs-act="details"]').catch(() => null);
        await h.page.waitForTimeout(300);
      }
      await h.page.click('.hb-slot[data-slot="2"]');
      await h.page.waitForTimeout(500);
      await shot(h.page, 'configure-open-' + tag);
    }
    await h.ctx.close();
    if (vp.width === 922) {
      const l = await open(vp, HUNT, (env) => {
        env.hunt.session = Object.assign({}, env.hunt.session, { id: env.hunt.session_id, leave_at: new Date(env.hunt_server_now_ms + 45000).toISOString(), phase: 'leaving' });
      });
      if (l.up) await shot(l.page, 'hunt-leaving-' + tag);
      await l.ctx.close();
    }
    const t = await open(vp, ALPHA, longBag);
    if (t.up) {
      for (const [key, id] of [['v', 'shop'], ['escape', 'settings']]) {
        if (await openKey(t.page, key === 'escape' ? 'Escape' : key, id)) {
          if (id === 'settings') { await t.page.click('.st-tab[data-cat="interface"]').catch(() => null); }
          await t.page.waitForTimeout(300);
          await shot(t.page, id + '-' + tag);
        }
      }
      if (await openKey(t.page, 'b', 'inventory')) {
        await t.page.click('.hw-pocket[data-item="iron_helm"]').catch(() => null);
        await t.page.hover('.hw-pocket[data-item="iron_helm"]').catch(() => null);
        await t.page.waitForTimeout(300);
        await shot(t.page, 'inventory-tip-' + tag);
        if (phone && vp.width !== 844) {
          await t.page.mouse.move(2, 200);
          await t.page.waitForTimeout(250);
          await shot(t.page, 'inventory-equip-' + tag);
        }
      }
    }
    await t.ctx.close();
  }
}

/* The pages each rule reads: a mutant named for a rule runs those alone, or the pages its own fifth field names
   (PH-5's hunt bar and analyzer tabs are measured on the hunt pages, its Shop, tooltip and Equip in town). */
const BLOCKS_OF = Object.freeze({ 'PH-1': ['configure'], 'PH-2': ['hunt'], 'PH-3': ['portrait'], 'PH-4': ['town'], 'PH-5': ['town'] });
/* Each planted defect undoes one fix; each must turn a rule red. */
const MUTANTS = [
  ['PH-1 the configure sheet\'s list does not scroll', 'src/styles/hunt.css', '  .hs-win[data-hs-win="configure-action"] .ca-mid {', '  .hs-win[data-hs-win="configure-action"] .ca-mid-x {'],
  ['PH-1 the configure sheet is the window\'s 800 px on a 667 px screen', 'src/styles/hunt.css', 'width: 100%; min-width: 100%; max-width: 100%;', 'width: 100vw; min-width: 100%; max-width: none;'],
  ['PH-1 the screen widgets widen the page', 'src/styles/shell.css', '.hs-screen { z-index: 6; overflow: clip; }', '.hs-screen { z-index: 6; }'],
  ['PH-1 a new tab opens mid-list', 'src/shell/windows/configure-action.js', "v.hover = null; repaint(); listToTop(body); return; }", "v.hover = null; repaint(); return; }"],
  ['PH-1 the column heads hide the wrong cell', 'src/styles/hunt.css', '  .ca-head .ca-c[data-c="1"], .ca-row .ca-c[data-c="1"] { display: none; }', '  .ca-head .ca-c:nth-of-type(2), .ca-row .ca-c[data-c="1"] { display: none; }'],
  ['PH-2 Hunt details only shows', 'src/shell/widgets/hunt-topbar.js', "  if (action === 'details') { ctx.hud.setVisible('analyzer', !ctx.hud.isShown('analyzer')); return; }", "  if (action === 'details') { ctx.show('analyzer'); return; }"],
  ['PH-2 the analyzer has no close', 'src/shell/widgets/analyzer.js', "  if (action === 'hide') { ctx.hud.setVisible('analyzer', false); return; }", ''],
  ['PH-2 the analyzer sits over the hunt bar', 'src/data/hud-widgets.js', "    below: Object.freeze(['hunt-topbar']),\n", ''],
  ['PH-2 the phone hunt bar is as wide as the ground\'s name', 'src/styles/hunt.css', '  .ht-bar { flex-wrap: nowrap; width: auto; justify-content: flex-end; }', '  .ht-bar { flex-wrap: nowrap; width: fit-content; }'],
  ['PH-2 a party of two runs under the action bar', 'src/styles/hunt.css', '  .hp-party { max-height: calc(100vh - 160px); }', ''],
  ['PH-2 the leaving hunt bar keeps every word', 'src/styles/hunt.css', '  .ht-bar:has(.ht-leaving:not([hidden])) .is-leave { display: none; }', ''],
  ['PH-3 no turn-sideways card', 'src/styles/app.css', '  .turn-phone { display: flex; }', '  .turn-phone { display: none; }'],
  ['PH-3 the turn-sideways card on every small screen', 'src/styles/app.css', '@media (orientation: portrait) and (max-width: 600px) and (hover: none) and (pointer: coarse) {', '@media (max-width: 540px), (max-height: 540px) and (max-width: 1024px) {'],
  ['PH-4 the words are not the toggle\'s label', 'src/shell/windows/settings.js', "? '<label class=\"st-line\">'", "? '<div class=\"st-line\">'"],
  ['PH-4 the slider is its 14 px track', 'src/styles/hunt.css', '  .st-row input[type="range"] { height: var(--tap);', '  .st-row input[type="range"] { height: 14px;'],
  ['PH-5 the Shop\'s Buy is 30 px', 'src/styles/windows.css', '  .hw-line > .hh-tool { min-height: 40px; }', '  .hw-line > .hh-tool { min-height: 30px; }'],
  ['PH-5 the tooltip runs off a short screen', 'src/styles/windows.css', '  .hw-tip { width: 460px; columns: 2;', '  .hw-tip { width: 240px; columns: 1;'],
  ['PH-5 the picked item scrolls away', 'src/styles/windows.css', '  .hw-pick.is-on { position: sticky;', '  .hw-pick.is-on { position: static;'],
  ['PH-5 the analyzer tabs are 30 px', 'src/styles/hunt.css', '  .ha-tab, .ht-bar .hh-tool { min-height: 40px; }', '  .ha-tab, .ht-bar .hh-tool { min-height: 30px; }', ['hunt']],
];

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'phone-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  if (!process.argv.includes('--mutate')) {
    const fails = await rules(null, shots);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'phone-touch: ' + fails.length + ' rule(s) RED' : 'phone-touch: the configure sheet scrolls with Save in reach, Hunt details toggles and the analyzer closes clear of the hunt bar, portrait asks to turn, Settings and the bag answer a thumb' + (shots ? ' (shots in ' + shots + ')' : ''));
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await rules(null, null);
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  console.log('  ✓ clean control green');
  let bad = 0;
  for (const [name, file, from, to, only] of MUTANTS) {
    const text = await readFile(join(ROOT, file), 'utf8');
    if (text.split(from).length !== 2) { console.log('  ✗ ' + name + ' — anchor not found once in ' + file); bad++; continue; }
    const fails = await rules({ [file]: text.replace(from, to) }, null, { stopAtFirst: true, blocks: only || BLOCKS_OF[name.split(' ')[0]] });
    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ').slice(0, 2).join(' ') + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  console.log(bad ? 'phone-touch --mutate: ' + bad + ' escaped' : 'phone-touch --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

main();
