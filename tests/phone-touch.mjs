#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/phone-touch.mjs — THE PHONE: SHEETS THAT FIT, PANELS THAT CLOSE, TARGETS A THUMB CAN HIT.
//
//   node tests/phone-touch.mjs                the rules
//   node tests/phone-touch.mjs --mutate       every planted defect must turn a rule RED
//   node tests/phone-touch.mjs --only PH-6    one rule's pages alone (with --shots, that rule's shots alone)
//   node tests/phone-touch.mjs --shots <dir>  also write the visual-gate screenshots (667x375, 844x390,
//                                             922x423, portrait 390x844 and desktop 1440x900, fonts loaded)
//
// mutant-anchors: src/styles/hunt.css src/styles/windows.css src/styles/shell.css src/styles/app.css src/shell/shell.js play.html src/shell/windows/configure-action.js src/shell/widgets/hunt-topbar.js src/shell/widgets/analyzer.js src/shell/windows/settings.js src/data/hud-widgets.js src/shell/windows/characters.js src/shell/widgets/action-bar.js src/shell/launcher-names.js src/shell/off-why.js src/shell/windows/tally.js src/shell/windows/shop.js src/app/world-pane.js src/app/sign-in.js src/app/boot.js src/net/connection.js
// mutant-writes-tree: no — page mutants are served overrides
//
// QA's phone playtest (2026-10-24) scored mobile 4/10. play.html with supabase-js and the REST paths stubbed
// (tests/_client-harness.mjs): tests/fixtures/hunt-envelope.json in a hunt, tests/fixtures/alpha-envelope.json
// in town. Phones are landscape (CLAUDE.md §1, §7); the phone query is the frozen one.
//   PH-1 CONFIGURE ACTION FITS (667x375, 844x390, 922x423): on the Spells, Food & drink and Ammo tabs the list scrolls
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
//   PH-6 A LONG COACH ENDS ABOVE THE ACTION BAR (667x375, 844x390, 922x423; under the hunt bar and under the icon
//        row in town): a high Level's "What next" card ends above the bar's top and on screen; its words end part-way
//        into a line (the cue they scroll) and scroll to their end under a wheel over them while its fold stays on
//        screen, pressable, and folds it. At 1440x900 the card is never capped
//   PH-7 THE PHONE'S OWN BAR (667x375, 844x390, 922x423; Tyler 10-25): stance, Chase, distance, the setup's name, its
//        saved setups and sliders, and the stamina "+" are each on screen, cut by no clipping box and pressable where
//        drawn; the tutorial's hooks (data-coach-hook) are each on one shown element; the ring's words sit inside its
//        disc and no pixel medallion is left; a sideways swipe over the slots reaches slots 10 and 20
//   PH-8 THE PHONE'S BAR NEVER COSTS THE DESKTOP (1280x800, 1440x900, 1920x1080; Tyler 10-25): the bar on screen,
//        every filled slot's icon 64 px (x2), the fight controls and the stamina "+" in view and pressable without
//        opening anything, the ring's words inside its disc, no pixel medallion
//   PH-9 THE STAMINA "+" (844x390; Tyler 10-25): a panel wholly on screen with the server's quote and Buy in reach;
//        ONE hr_stamina_refill at that price, Buy off until the answer, the stamina from the re-read; a refusal in
//        words; refills used up or too little gold turn Buy off with the reason and keep the "+"; the premium note
//        for a hero without premium only
//   PH-10 THE COACH NEVER LIES ON THE FIGHT (922x423, 844x390; first-hour playtest 10-29 #10: the card covered the hero
//        mid-fight): in a hunt, the open card under the hunt bar crosses neither the viewed hero nor a party member
//        (each figure's tile and the name plate over it), nor does the camera push them under the Party panel to
//        make room; the card stays on screen. At 1440x900 it is on screen
//   A phone player's three days (2026-10-31, art/review/player-feedback-2026-10-31/phone.txt on lane/f-phone):
//   PH-11 THE STRIP (667x375, 844x390, 922x423): "Heroes" a 40 px press clear of the icon row, every icon on screen and
//         at least 40 px wide, a shown hero tab at least 44 px wide and clear of the row, the strip no taller than 40 px;
//         its sheet names every icon (each >= 44 px, each opens its window) and holds Character list and Sign out in
//         reach. At 1440x900 the strip keeps its three words, the chips stay, none of the phone's routes show
//   PH-12 INVITE WITHOUT A LONG PRESS (the same sizes): with two heroes the other's row has a visible Invite, ONE
//         hr_hunt_party_invite_own for its slot, the answer in words; the sheet tells a phone no "right-click" or key
//   PH-13 NOTHING LOST OFF THE EDGE (667x375; the chat at 922x423 too): a gold press beside the slots brings 10 and 20 on
//         screen and back; the chat's box and Send on the sheet, 40 px tall, no tooltip left on the sheet's title
//   PH-14 MEANING WITHOUT HOVER (touch, 667x375 and 922x423): a held icon names itself and opens nothing, a tap opens; no
//         key chip on a sheet; a press on a grey Buy says why beside it; a slot's sheet says why it will not fire;
//         hunting, Tamsin's board says why every Take is grey
//   PH-15 ONE CARD AT A TIME (667x375, 922x423): three alerts show as one solid card and a count, clear of the bar and of
//         the coach card; in town the card stands clear of the hero's column and the place's name
//   PH-16 NEVER A SILENT WAIT (667x375): with the world's module held, offline says so on the waiting line and the
//         connection's line, and both clear back online; a leave with no answer says it waits, and says the connection is
//         gone; a counting leave says what the wait is for, under the bar
//   PH-17 THE DOOR (phones, 1440x900): no focus on a phone (it throws the keyboard up), links >= 44 px, nothing scrolls;
//         a desktop keeps the first field's focus
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';
import { RING_WORDS, RING_WORDS_WIDEST } from './_bar-probes.mjs';

const clone = (o) => JSON.parse(JSON.stringify(o));
const HUNT = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/hunt-envelope.json'), 'utf8'));
const ALPHA = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
/* The scene plays huntPlaybackDelayMs behind the server (src/session/config.js), as tests/hunt-screen.mjs states it. */
HUNT.hunt_server_now_ms += (await import(pathToFileURL(join(ROOT, 'src/session/config.js')).href)).SESSION_CONFIG.huntPlaybackDelayMs;
const { ITEMS } = await import(pathToFileURL(join(ROOT, 'src/data/items.js')).href);
const { charXpForLevel } = await import(pathToFileURL(join(ROOT, 'src/core/xp.js')).href);
/* A long bag (the playtest's hero carried 42 stacks): thirty more stacks of plain materials. */
const MATERIALS = Object.keys(ITEMS).filter((id) => !ITEMS[id].kind && !ITEMS[id].type && !(id in ALPHA.inventory)).slice(0, 30);
/* The town prep: that long bag, and a tool and a piece of gear for sale (the Shop sells no supplies, AW-7). */
function longBag(env) {
  for (const id of MATERIALS) env.inventory[id] = 3;
  env.shop = Object.assign({}, env.shop, { offers: env.shop.offers.concat([{ offer: 'supply.bronze_axe', item: 'bronze_axe', kind: 'tool', price: 120 },
    { offer: 'supply.leather_gloves', item: 'leather_gloves', kind: 'gear', price: 160 }]) });
}

/* A read-only hook, served (never written to the tree): the World pane's runtime on window.__world (PH-10 reads the
   figures' screen spots), as tests/window-camera.mjs serves it. */
const PANE = 'src/app/world-pane.js';
const paneSrc = await readFile(join(ROOT, PANE), 'utf8');
if (!paneSrc.includes('    runtime.sync();\n')) throw new Error('phone-touch: the World hook anchor moved');
const WORLD_HOOK = { [PANE]: paneSrc.replace('    runtime.sync();\n', '    runtime.sync();\n    window.__world = runtime;\n') };

const PHONES = [{ width: 667, height: 375 }, { width: 844, height: 390 }, { width: 922, height: 423 }];
const tagOf = (vp) => vp.width + 'x' + vp.height;
const LOAD_MS = 15000;
const wait = (page, fn, arg, ms = LOAD_MS) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

function scripted(fixture, prep) {
  /* Like the real server, the residue a put stores comes back in every later envelope (client_state). */
  const s = { env: clone(fixture), version: 1, calls: [], residue: {} };
  if (prep) prep(s.env);
  /* a fixture's own residue is where the server keeps it: the store every later envelope echoes */
  if (s.env.client_state) { s.residue = Object.assign({}, s.env.client_state); delete s.env.client_state; }
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
    /* PH-9: a stamina refill, held while s.holdRefill (s.releaseRefill answers it); s.onRefill is the server. */
    if (name === 'hr_stamina_refill' && s.onRefill) { if (s.holdRefill) await new Promise((ok) => { s.releaseRefill = ok; }); return json(s.onRefill(body)); }
    /* PH-14: her board; PH-16: a leave whose answer does not come (a tunnel). */
    if (name === 'hr_tally_view') return json({ ok: true, board: [], hunting: true });
    if (name === 'hr_hunt_leave' && s.holdLeave) return undefined;
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
  for (const tab of ['spells', 'food', 'ammo']) {
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
  /* ...and never will: the screen layer is the screen. Once the moved widgets came to be clamped on screen (widget-move,
     v0.2.46) nothing of today's fixture runs past the edge, so a screen widget wider than its room is planted (the 667 px
     icon row of 10-24, a long name, a future widget at its default place): the page still may not widen. */
  const wide = await page.evaluate(() => { const scr = document.querySelector('.hs-screen'); if (!scr) return null;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;top:0;left:calc(100% - 40px);width:480px;height:8px;pointer-events:none';
    scr.appendChild(probe);
    const out = { doc: document.scrollingElement.scrollWidth - innerWidth, past: probe.getBoundingClientRect().right - innerWidth };
    probe.remove(); return out; });
  if (!wide) fails.push('PH-1 [' + tag + '] CONTROL: no screen layer (.hs-screen)');
  else if (wide.past <= 0) fails.push('PH-1 [' + tag + '] CONTROL: the planted wide widget does not run past the screen');
  else if (wide.doc > 0) fails.push('PH-1 [' + tag + '] a screen widget wider than its room widens the page by ' + wide.doc + ' px');
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

/* ── PH-6 ── A high Level's "What next" (the Coordinator's 10-24 gate: a Level 29 mage at 844x390, the card ran down
   over HP / XP / MP): the Defense line, five ripe turnips, the next ground, the next gear and the next Magic unlock. */
function longCoach(env) {
  env.state = Object.assign({}, env.state, { level_xp: charXpForLevel(29) + 100 });
  env.hunt_settings = Object.assign({}, env.hunt_settings, { role: 'mage', discipline: 'staff' });
  env.skills = { magic: { xp: 9000000, level: 44 }, defense: { xp: 0, level: 1 } };
  env.farm_land = { cap: 6, plot_level: 1, deeds: 0, plots: [0, 1, 2, 3, 4].map((i) => ({ i, crop: 'turnip', ready: true })) };
  /* the reactive cards a Level 29 hero has long since read (residue coach.read), and no better gear in its bag, so
     the coach is the long "What next" line, not "Your hero just ate" or "Wear what you found" */
  env.client_state = Object.assign({}, env.client_state, { coach: { read: ['first_eat', 'first_drink', 'fight_settings', 'storage', 'stamina_low'] } });
  if (env.inventory) for (const id of ['bronze_sword', 'steel_sword', 'iron_helm', 'iron_platebody', 'shortbow']) delete env.inventory[id];
}
const COACH = `(() => { const p = document.querySelector('.hs-widget .hs-pointer:not(.is-min)'); if (!p) return null;
  const t = p.querySelector('.hs-coach-text'), dash = p.querySelector('.hs-coach-min');
  return { id: p.getAttribute('data-tutorial'), card: window.__r(p), hub: window.__r('.hb-bar'), chars: (p.textContent || '').length, maxH: getComputedStyle(p).maxHeight,
    dash: window.__onScreen(window.__r(dash)) && window.__hits(dash), text: t && window.__r(t), top: t ? t.scrollTop : 0, end: t ? t.scrollHeight - t.clientHeight : 0,
    lines: t ? t.clientHeight / parseFloat(getComputedStyle(t).lineHeight) : 0 }; })()`;
const coachState = (page) => page.evaluate((src) => (0, eval)(src), COACH);
async function coachFits(page, tag, fails, phone) {
  const c = await coachState(page);
  if (!c) { fails.push('PH-6 [' + tag + '] CONTROL: no open coach card'); return; }
  if (c.chars < 300) { fails.push('PH-6 [' + tag + '] CONTROL: the coach (' + c.id + ') says only ' + c.chars + ' characters, so it proves nothing'); return; }
  if (!phone) { if (c.maxH !== 'none' || c.end > 0) fails.push('PH-6 [' + tag + '] the desktop coach is capped (' + c.maxH + ', ' + c.end + ' px to scroll)'); return; }
  if (!c.hub) { fails.push('PH-6 [' + tag + '] CONTROL: no action bar'); return; }
  if (!window_onScreen(c.card, page.viewportSize()) || c.card.bottom > c.hub.top + 0.5) {
    fails.push('PH-6 [' + tag + '] the coach card runs ' + Math.round(c.card.bottom - c.hub.top) + ' px over the action bar (' + Math.round(c.card.top) + '..' + Math.round(c.card.bottom) + ', the bar at ' + Math.round(c.hub.top) + ')');
    return;
  }
  if (!c.dash) { fails.push('PH-6 [' + tag + '] the coach\'s fold is off screen or covered'); return; }
  /* A phone shows its scrollbar only while it scrolls: the words' box ends part-way into a line, so the cut says "more". */
  const part = c.lines % 1;
  if (c.end > 0 && (part < 0.25 || part > 0.75)) { fails.push('PH-6 [' + tag + '] the coach\'s words end on a whole line (' + c.lines.toFixed(2) + ' lines shown), so nothing says they scroll'); return; }
  /* Its words scroll to their end under a wheel (a thumb) over them, and the fold stays in reach and folds it. */
  await page.mouse.move(c.text.left + c.text.width / 2, c.text.top + c.text.height / 2);
  let s = c;
  for (let i = 0; i < 20 && s.top < s.end - 1; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(40); s = await coachState(page); }
  if (!(c.end > 0) || s.top < s.end - 1) { fails.push('PH-6 [' + tag + '] the coach\'s words never scroll to their end (' + Math.round(s.top) + ' of ' + Math.round(s.end) + ' px)'); return; }
  if (!s.dash) { fails.push('PH-6 [' + tag + '] the coach\'s fold scrolls away with its words'); return; }
  if (!(await page.click('.hs-widget .hs-pointer .hs-coach-min', { timeout: 2500 }).then(() => true, () => false))) { fails.push('PH-6 [' + tag + '] the coach\'s fold cannot be pressed'); return; }
  if (!(await wait(page, () => document.querySelector('.hs-widget .hs-pointer.is-min'), null, 3000))) fails.push('PH-6 [' + tag + '] a press on the coach\'s fold did not fold it');
}
function window_onScreen(r, vp) { return !!r && r.left >= -0.5 && r.top >= -0.5 && r.right <= vp.width + 0.5 && r.bottom <= vp.height + 0.5; }

/* ── PH-10 ── The first card of a hunt ("Your hero fights alone"): the hero and each party member, as boxes on screen
   (the figure's tile and the name plate a tile over it), never under the card. */
async function coachOffFight(page, tag, fails, phone, crew) {
  const f = await page.evaluate((units) => {
    const w = window.__world, s = w && w.stats();
    if (!s || !s.hunt || !s.hunt.hero) return null;
    const p = document.querySelector('[data-hs-widget="hunt-topbar"] > .hs-pointer:not(.is-min)');
    const t = 32 * s.z / s.dpr;
    const box = (x, y) => { const q = w.screenOf(x, y); return { left: q.x - t / 2, right: q.x + t / 2, top: q.y - 1.5 * t, bottom: q.y + t / 2 }; };
    const mates = (s.hunt.units || []).filter((u) => units.includes(u.unit) && u.unit !== s.hunt.hero.unit);
    return { card: p && window.__r(p), id: p && p.getAttribute('data-tutorial'), party: window.__r('.hp-party'),
      figures: [['the hero', box(s.hunt.hero.x, s.hunt.hero.y)]].concat(mates.map((u) => ['party unit ' + u.unit, box(u.x, u.y)])) };
  }, crew);
  if (!f) { fails.push('PH-10 [' + tag + '] CONTROL: no World runtime or no hero in the hunt'); return; }
  if (!f.card) { fails.push('PH-10 [' + tag + '] CONTROL: no open coach card under the hunt bar'); return; }
  if (f.figures.length !== crew.length) { fails.push('PH-10 [' + tag + '] CONTROL: ' + f.figures.length + ' figures drawn, want the hero and ' + (crew.length - 1) + ' party member(s)'); return; }
  if (!window_onScreen(f.card, page.viewportSize())) { fails.push('PH-10 [' + tag + '] the coach card runs off the screen: ' + JSON.stringify(f.card)); return; }
  if (!phone) return;
  const hit = f.figures.filter(([, b]) => window_cross(f.card, b)).map(([n, b]) => n + ' at ' + Math.round(b.left) + '..' + Math.round(b.right));
  if (hit.length) fails.push('PH-10 [' + tag + '] the coach card (' + f.id + ', ' + Math.round(f.card.left) + '..' + Math.round(f.card.right) + ' x '
    + Math.round(f.card.top) + '..' + Math.round(f.card.bottom) + ') lies on ' + hit.join(', '));
  /* ...and a card that only pushes the fight under the Party panel has hidden it all the same */
  if (!f.party) { fails.push('PH-10 [' + tag + '] CONTROL: no Party panel'); return; }
  const under = f.figures.filter(([, b]) => window_cross(f.party, b)).map(([n, b]) => n + ' at ' + Math.round(b.left) + '..' + Math.round(b.right));
  if (under.length) fails.push('PH-10 [' + tag + '] with the coach card up the camera puts ' + under.join(', ') + ' under the Party panel (its right edge ' + Math.round(f.party.right) + ')');
}

/* ── PH-7 ── THE PHONE'S OWN BAR (Tyler 10-25: "Not having it there is dangerous for the player"; "mobile needs its own
   bar"). Every fight control and the stamina "+" on screen, uncut by any box that clips it and pressable where it is
   drawn; the tutorial's hooks each on one shown element; the ring's words inside its disc; the last column of slots
   reachable by a sideways swipe over them when the screen is too narrow for all ten. */
const HOOKS = ['fight-settings', 'preset', 'stance', 'chase', 'distance', 'level', 'stamina', 'stamina-buy'];
const BAR_FIT = `(() => {
  const cut = (c) => { const r = c.getBoundingClientRect();
    for (let a = c.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a);
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      const q = a.getBoundingClientRect(); if (r.left < q.left - 0.5 || r.right > q.right + 0.5 || r.top < q.top - 0.5 || r.bottom > q.bottom + 0.5) return true; }
    return false; };
  const ctl = Array.from(document.querySelectorAll('.hb-plaque [data-opt="stance"], .hb-plaque [data-opt="chase"], .hb-plaque [data-opt="distance"], .hb-plaque .hb-more, .hb-plaque .hb-ok, .hb-set .hs-name, .hb-stam-buy'));
  const bad = ctl.filter((c) => !(window.__onScreen(window.__r(c)) && window.__hits(c) && !cut(c))).map((c) => (c.getAttribute('data-opt') || c.className) + (c.getAttribute('data-val') ? ' ' + c.getAttribute('data-val') : ''));
  const hooks = ${JSON.stringify(HOOKS)}.filter((h) => { const e = document.querySelectorAll('[data-coach-hook="' + h + '"]'); return e.length !== 1 || !window.__onScreen(window.__r(e[0])); });
  return { n: ctl.length, bad, hooks };
})()`;
async function barFits(page, tag, fails) {
  await wait(page, () => document.querySelector('.hb-plaque [data-opt="stance"]:not([disabled])'));
  const f = await page.evaluate((src) => (0, eval)(src), BAR_FIT);
  if (f.n < 9 || f.bad.length) fails.push('PH-7 [' + tag + '] fight controls off screen, cut or covered: ' + f.bad.join(', ') + ' (' + f.n + ' found)');
  if (f.hooks.length) fails.push('PH-7 [' + tag + '] the tutorial hooks missing, doubled or off screen: ' + f.hooks.join(', '));
  const ring = await page.evaluate((src) => (0, eval)(src), RING_WORDS);
  if (ring.err || !ring.n || ring.out.length || ring.bitmap || ring.crisp) fails.push('PH-7 [' + tag + '] the ring: ' + JSON.stringify(ring));
  const widest = await page.evaluate((src) => (0, eval)(src), RING_WORDS_WIDEST);
  if (widest.err || !widest.n || widest.out.length) fails.push('PH-7 [' + tag + '] the ring at its widest words (XP 99% under Level 999): ' + JSON.stringify(widest));
  /* A swipe over the slots (a sideways wheel, as a thumb scrolls) brings slots 10 and 20 into reach. */
  const g = await page.evaluate(() => window.__r('.hb-grid'));
  if (!g) { fails.push('PH-7 [' + tag + '] CONTROL: no slot block'); return; }
  await page.mouse.move(g.left + g.width / 2, g.top + g.height / 2);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(240, 0); await page.waitForTimeout(40); }
  await page.waitForTimeout(250);
  const last = await page.evaluate(() => ['9', '19'].map((n) => { const s = document.querySelector('.hb-slot[data-slot="' + n + '"]'); const r = window.__r(s), g = window.__r('.hb-grid');
    return !!r && window.__onScreen(r) && window.__hits(s) && r.left >= g.left - 0.5 && r.right <= g.right + 0.5; }));
  if (last.some((x) => !x)) fails.push('PH-7 [' + tag + '] slots 10 and 20 cannot be reached by a swipe over the slots: ' + JSON.stringify(last));
}

/* ── PH-8 ── THE PHONE'S BAR NEVER COSTS THE DESKTOP (Tyler 10-25: "I don't want to sacrifice shit on desktop for mobile
   ever"). At 1280x800 (a Steam Deck), 1440x900 and 1920x1080 the bar is on screen, every filled slot's icon is 64 px (its
   32 art px at x2, the bigger icons he asked for), the setup, its buttons, target, stance, chase, distance and the
   stamina "+" are in view and pressable without opening anything, the ring's words sit inside its disc and no pixel
   medallion (its clock ticks and stepped bezel) is left. */
const DESK_BAR = `(() => {
  const bar = document.querySelector('.hb-bar').getBoundingClientRect();
  const icons = Array.from(document.querySelectorAll('.hb-slot[data-item] .hh-icon')).map((i) => Math.round(i.getBoundingClientRect().width) + 'x' + Math.round(i.getBoundingClientRect().height));
  const ctl = Array.from(document.querySelectorAll('.hb-plaque [data-opt]:not([data-opt="gold_floor"]), .hb-plaque .hb-more, .hb-plaque .hb-ok, .hb-set .hs-name, .hb-stam-buy'));
  return { inside: bar.left >= 0 && bar.right <= innerWidth && bar.bottom <= innerHeight, icons, n: ctl.length,
    hidden: ctl.filter((c) => !(window.__onScreen(window.__r(c)) && window.__hits(c))).map((c) => c.getAttribute('data-opt') || c.className) };
})()`;
async function desktopBar(page, tag, fails) {
  await wait(page, () => document.querySelector('.hb-plaque [data-opt="stance"]:not([disabled])'));
  const d = await page.evaluate((src) => (0, eval)(src), DESK_BAR);
  if (!d.inside) fails.push('PH-8 [' + tag + '] the desktop bar runs off the screen');
  if (!d.icons.length || d.icons.some((s) => s !== '64x64')) fails.push('PH-8 [' + tag + '] the slot icons are not 64 px (x2): ' + d.icons.join(' '));
  if (d.n < 9 || d.hidden.length) fails.push('PH-8 [' + tag + '] fight controls not in view and pressable on the desktop bar: ' + d.hidden.join(', ') + ' (' + d.n + ' found)');
  const ring = await page.evaluate((src) => (0, eval)(src), RING_WORDS);
  if (ring.err || !ring.n || ring.out.length || ring.bitmap || ring.crisp) fails.push('PH-8 [' + tag + '] the ring: ' + JSON.stringify(ring));
  const widest = await page.evaluate((src) => (0, eval)(src), RING_WORDS_WIDEST);
  if (widest.err || !widest.n || widest.out.length) fails.push('PH-8 [' + tag + '] the ring at its widest words (XP 99% under Level 999): ' + JSON.stringify(widest));
}

/* ── PH-9 ── THE STAMINA "+" (Tyler 10-25), on a phone (844x390): it opens a panel wholly on screen with the server's quote
   ("+4 h for 1,880 gp", "3 h 12 m of 8 h") and Buy in reach; Buy sends ONE hr_stamina_refill at that price and is off until
   the answer; the stamina shown moves only with the re-read; a refusal reads in words; today's refills used or too little
   gold turn Buy off with the reason and keep the "+"; "Premium raises your stamina cap by 4 hours." shows to a hero
   without premium only. */
const H4 = 4 * 3600000;
const freeHero = (gold, quote) => (env) => {
  env.premium = { active: false };
  env.state = Object.assign({}, env.state, { gold });
  env.stamina = Object.assign({}, env.stamina, { ms: 11520000, max_ms: 28800000 });
  env.stamina_refill = quote;
};
const QUOTE = { available: true, why: null, restore_ms: H4, price: 1880, n: 2, per_day: 6 };
const PANEL = `(() => { const b = document.querySelector('.hb-buy'), q = (k) => b.querySelector(k), shown = (e) => !!e && e.getClientRects().length > 0;
  return { on: shown(b), whole: window.__onScreen(window.__r(b)), now: q('.hb-buy-now').textContent, quote: q('.hb-buy-quote').textContent, why: q('.hb-buy-why').textContent,
    premium: shown(q('.hb-buy-premium')), off: q('.hb-buy-go').disabled, reach: window.__onScreen(window.__r(q('.hb-buy-go'))) && window.__hits(q('.hb-buy-go')),
    msg: q('.hb-buy-msg').textContent, plus: window.__onScreen(window.__r('.hb-stam-buy')) }; })()`;
const panelOf = (page) => page.evaluate((src) => (0, eval)(src), PANEL);
async function staminaBuy(open, fails, done) {
  const tag = '844x390', vp = { width: 844, height: 390 };
  const a = await open(vp, HUNT, freeHero(25000, QUOTE));
  if (!a.up) { fails.push('PH-9 the hunt did not mount'); await a.ctx.close(); return; }
  await a.page.click('.hb-stam-buy', { timeout: 2500 }).catch(() => null);
  await a.page.waitForTimeout(250);
  const p0 = await panelOf(a.page);
  if (!p0.on || !p0.whole || !p0.reach || !/\+4 h for 1,880 gp/.test(p0.quote) || p0.off || p0.now !== '3 h 12 m of 8 h') fails.push('PH-9 [' + tag + '] the "+" did not open the server\'s quote whole on screen: ' + JSON.stringify(p0));
  if (!p0.premium) fails.push('PH-9 [' + tag + '] a hero without premium is not told premium raises the cap');
  a.s.holdRefill = true;
  a.s.onRefill = () => { a.s.env.stamina = Object.assign({}, a.s.env.stamina, { ms: a.s.env.stamina.ms + H4 }); a.s.env.stamina_refill = Object.assign({}, QUOTE, { restore_ms: 2880000, price: 520, n: 3 }); return { ok: true }; };
  await a.page.click('.hb-buy-go', { timeout: 2500 }).catch(() => null);
  for (let i = 0; i < 40 && !a.s.calls.some((c) => c.name === 'hr_stamina_refill'); i++) await a.page.waitForTimeout(50);
  const mid = await panelOf(a.page);
  if (!mid.off || mid.now !== '3 h 12 m of 8 h') fails.push('PH-9 [' + tag + '] Buy stayed on (or the stamina moved) before the server answered: ' + JSON.stringify(mid));
  a.s.holdRefill = false;
  if (a.s.releaseRefill) a.s.releaseRefill();
  const bought = await wait(a.page, () => document.querySelector('.hb-buy-now').textContent === '7 h 12 m of 8 h' && document.querySelector('.hb-buy-msg').textContent === 'Stamina restored.', null, 6000);
  const sent = a.s.calls.filter((c) => c.name === 'hr_stamina_refill');
  if (sent.length !== 1 || sent[0].body.p_price !== 1880 || sent[0].body.p_slot !== 0 || !sent[0].body.p_idem) fails.push('PH-9 [' + tag + '] Buy sent ' + JSON.stringify(sent.map((c) => c.body)));
  if (!bought) fails.push('PH-9 [' + tag + '] after the server answered the panel reads ' + JSON.stringify(await panelOf(a.page)));
  a.s.onRefill = () => ({ ok: false, error: 'quote_changed' });
  await a.page.click('.hb-buy-go', { timeout: 2500 }).catch(() => null);
  if (!(await wait(a.page, () => /^Prices or your bag changed/.test(document.querySelector('.hb-buy-msg').textContent), null, 6000))) fails.push('PH-9 [' + tag + '] a refused refill reads ' + JSON.stringify(await panelOf(a.page)));
  await done(a, tag);
  /* Cannot be bought: Buy off with the server's words, the "+" still there; a premium hero is not told about premium. */
  for (const [label, prep, words, premium] of [
    ['today\'s refills used', freeHero(25000, { available: false, why: 'refill_limit', n: 7, per_day: 6 }), /^No more stamina refills today\.$/, true],
    ['not enough gold, a premium hero', (env) => { freeHero(100, QUOTE)(env); env.premium = { active: true }; }, /^Not enough gold\.$/, false]]) {
    const o = await open(vp, HUNT, prep);
    if (!o.up) { fails.push('PH-9 [' + label + '] the hunt did not mount'); await o.ctx.close(); continue; }
    await o.page.click('.hb-stam-buy', { timeout: 2500 }).catch(() => null);
    await o.page.waitForTimeout(250);
    const p = await panelOf(o.page);
    if (!words.test(p.why) || !p.off || !p.plus) fails.push('PH-9 [' + tag + '] ' + label + ': ' + JSON.stringify(p));
    if (p.premium !== premium) fails.push('PH-9 [' + tag + '] ' + label + ': the premium note ' + (premium ? 'is missing' : 'shows to a premium hero'));
    await done(o, tag);
  }
}

/* ── PH-11 to PH-17 ── A PHONE PLAYER'S THREE DAYS (art/review/player-feedback-2026-10-31/phone.txt, lane/f-phone). */
/* ── PH-11 ── The strip: nothing under the icon row, nothing squashed; All characters holds every way a phone lost. */
const twoHeroes = (env) => { env.hero_slots = [0, 1]; env.account = Object.assign({}, env.account, { max_concurrent: 4 }); env.party = null; env.party_invites = []; };
async function stripReach(page, tag, fails) {
  const f = await page.evaluate(() => {
    const all = document.querySelector('.char-tool.is-all'), box = document.querySelector('.char-tabs');
    const shown = (e) => e.getClientRects().length > 0;
    return { all: window.__r(all), hit: window.__hits(all), row: window.__r('.hs-launchers'), word: all.scrollWidth <= all.clientWidth + 1,
      strip: window.__r('.char-strip'), stage: window.__r('.world-stage'),
      icons: Array.from(document.querySelectorAll('.hs-launch')).map((e) => window.__r(e)),
      tabsBox: shown(box) ? window.__r(box) : null, tabs: shown(box) ? Array.from(box.querySelectorAll('.char-tab')).map((e) => window.__r(e)) : [],
      tools: Array.from(document.querySelectorAll('.char-tool:not(.is-all)')).filter(shown).length };
  });
  if (!f.all || !window_onScreen(f.all, page.viewportSize()) || !f.hit || f.all.height < 40) fails.push('PH-11 [' + tag + '] All characters is not a thumb\'s press on screen: ' + JSON.stringify(f.all) + ' hit ' + f.hit);
  else if (window_cross(f.all, f.row)) fails.push('PH-11 [' + tag + '] the icon row lies over All characters: ' + JSON.stringify([f.all, f.row]));
  if (!f.word) fails.push('PH-11 [' + tag + '] All characters\' word is cut');
  if (f.tools) fails.push('PH-11 [' + tag + '] ' + f.tools + ' more word(s) still stand in the strip');
  if (f.icons.length < 10 || f.icons.some((r) => r.width < 39.5 || !window_onScreen(r, page.viewportSize()))) fails.push('PH-11 [' + tag + '] an icon is under 40 px wide or off screen: ' + JSON.stringify(f.icons[0]));
  if (f.tabsBox && (f.tabsBox.width < 44 || window_cross(f.tabsBox, f.row))) fails.push('PH-11 [' + tag + '] the tabs get ' + Math.round(f.tabsBox.width) + ' px, or run under the icons');
  if (f.tabs.some((r) => r.width < 44 || r.height < 40)) fails.push('PH-11 [' + tag + '] a hero tab is squashed: ' + JSON.stringify(f.tabs));
  if (f.strip.height > 40) fails.push('PH-11 [' + tag + '] the strip costs the World ' + f.strip.height + ' px');
  await page.click('.char-tool.is-all', { timeout: 2500 }).catch(() => null);
  if (!(await wait(page, () => document.querySelector('[data-hs-win="characters"] .hw-char'), null, 4000))) { fails.push('PH-11 [' + tag + '] All characters did not open'); return; }
  await page.waitForTimeout(250);
  const names = await page.evaluate(() => { const rows = Array.from(document.querySelectorAll('[data-hs-win="characters"] .hw-icon-name'));
    return { n: rows.length, icons: document.querySelectorAll('.hs-launch').length, small: rows.filter((r) => r.getBoundingClientRect().height < 44).length, empty: rows.filter((r) => !r.textContent.trim()).length }; });
  if (names.n !== names.icons || names.small || names.empty) fails.push('PH-11 [' + tag + '] the sheet does not name every icon at a thumb\'s size: ' + JSON.stringify(names));
  for (const q of ['[data-hs-win="characters"] [data-app="characters"]', '[data-hs-win="characters"] [data-app="sign-out"]']) {
    const ok = await page.evaluate((s) => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return 'none'; e.scrollIntoView({ block: 'center' }); const r = window.__r(e); return window.__onScreen(r) && window.__hits(e) && r.height >= 44 ? 'ok' : JSON.stringify(r); }, q);
    if (ok !== 'ok') fails.push('PH-11 [' + tag + '] ' + q + ' is out of reach in the sheet: ' + ok);
  }
  /* A named icon opens its window. */
  await page.evaluate(() => document.querySelector('[data-hs-win="characters"] .hw-icon-name[data-hs-open="inventory"]').click());
  if (!(await wait(page, () => document.querySelector('[data-hs-win="inventory"]'), null, 3000))) fails.push('PH-11 [' + tag + '] a named icon opens nothing');
}
/* ...and a hero's Invite: a visible press, ONE ask for that slot, its answer in words; a phone reads no "right-click". */
async function inviteByPress(o, tag, fails) {
  const { page, s } = o;
  await page.click('.char-tool.is-all', { timeout: 2500 }).catch(() => null);
  if (!(await wait(page, () => document.querySelectorAll('[data-hs-win="characters"] .hw-char').length === 2, null, 6000))) { fails.push('PH-12 [' + tag + '] CONTROL: not two heroes in the sheet'); return; }
  await page.waitForTimeout(250);
  const line = await page.evaluate(() => document.querySelector('.hw-parties-line').textContent);
  if (/right-click|\(Y\)/i.test(line)) fails.push('PH-12 [' + tag + '] the sheet tells a phone: ' + line);
  const inv = await page.evaluate(() => { const b = Array.from(document.querySelectorAll('.hw-char-invite')).filter((e) => e.getClientRects().length); if (b.length !== 1) return 'shown on ' + b.length + ' rows'; b[0].scrollIntoView({ block: 'nearest' }); const r = window.__r(b[0]); return window.__onScreen(r) && window.__hits(b[0]) && r.height >= 40 ? 'ok' : JSON.stringify(r); });
  if (inv !== 'ok') { fails.push('PH-12 [' + tag + '] no Invite a thumb can press on the other hero: ' + inv); return; }
  await page.click('.hw-char-invite:not([hidden])', { timeout: 2500 }).catch(() => null);
  for (let i = 0; i < 40 && !s.calls.some((c) => c.name === 'hr_hunt_party_invite_own'); i++) await page.waitForTimeout(50);
  const sent = s.calls.filter((c) => c.name === 'hr_hunt_party_invite_own');
  if (sent.length !== 1 || sent[0].body.p_other_slot !== 1) fails.push('PH-12 [' + tag + '] Invite sent ' + JSON.stringify(sent.map((c) => c.body)));
  if (!(await wait(page, () => { const m = document.querySelector('.hw-parties-msg'); return m && m.textContent && !/Sending/.test(m.textContent); }, null, 4000))) fails.push('PH-12 [' + tag + '] Invite\'s answer says nothing');
}

/* ── PH-13 ── The slots' page press, and the chat's input on the sheet. */
async function slotPage(page, tag, fails) {
  const on = await page.evaluate(() => { const b = document.querySelector('.hb-page'); return !!b && b.getClientRects().length > 0 && window.__hits(b); });
  if (!on) { fails.push('PH-13 [' + tag + '] slots 10 and 20 are cut and nothing on screen says so'); return; }
  const at = (n) => page.evaluate((i) => { const s = document.querySelector('.hb-slot[data-slot="' + i + '"]'), g = window.__r('.hb-grid'), r = window.__r(s); return window.__onScreen(r) && window.__hits(s) && r.left >= g.left - 0.5 && r.right <= g.right + 0.5; }, n);
  await page.click('.hb-page', { timeout: 2500 }).catch(() => null);
  await page.waitForTimeout(200);
  if (!(await at(9)) || !(await at(19))) fails.push('PH-13 [' + tag + '] the press does not bring slots 10 and 20 on screen');
  await page.click('.hb-page', { timeout: 2500 }).catch(() => null);
  await page.waitForTimeout(200);
  if (!(await at(0)) || !(await at(10))) fails.push('PH-13 [' + tag + '] a second press does not bring slots 1 and 11 back');
}
async function chatFoot(page, tag, fails) {
  await page.click('.hs-launch[data-hs-open="chat"]', { timeout: 2500 }).catch(() => null);
  if (!(await wait(page, () => document.querySelector('[data-hs-win="chat"] .hc-field'), null, 4000))) { fails.push('PH-13 [' + tag + '] the chat did not open'); return; }
  await page.waitForTimeout(250);
  const c = await page.evaluate(() => Object.fromEntries(['.hc-field', '.hc-send'].map((q) => { const e = document.querySelector(q), r = window.__r(e); return [q, !!r && window.__onScreen(r) && window.__hits(e) && r.height >= 40]; })));
  for (const [q, ok] of Object.entries(c)) if (!ok) fails.push('PH-13 [' + tag + '] the chat\'s ' + q + ' is off the sheet or under 40 px');
  const title = await page.evaluate(() => { const t = document.querySelector('[data-hs-win="chat"] .hs-win-title'); const r = t.getBoundingClientRect(); return document.elementFromPoint(r.left + 8, r.top + r.height / 2) === t; });
  if (!title) fails.push('PH-13 [' + tag + '] a tooltip lies over the sheet\'s title after the icon\'s tap');
}

/* ── PH-14 ── Meaning without hover, by touch. A touch context: isMobile, hasTouch. */
const holdIcon = (page, id, ms) => page.evaluate(async ([i, t]) => {
  const icon = document.querySelector('.hs-launch[data-hs-open="' + i + '"]');
  const b = icon.getBoundingClientRect(), at = { bubbles: true, pointerType: 'touch', clientX: b.left + 8, clientY: b.top + 8 };
  icon.dispatchEvent(new PointerEvent('pointerdown', at));
  await new Promise((ok) => setTimeout(ok, t));
  const n = document.querySelector('.hs-launch-name');
  const r = n && n.getBoundingClientRect();
  const out = { name: n ? n.textContent : null, on: !!r && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
  icon.dispatchEvent(new PointerEvent('pointerup', at));
  icon.click();
  return out;
}, [id, ms]);
async function touchMeaning(page, tag, fails) {
  const held = await holdIcon(page, 'inventory', 550);
  if (held.name !== 'Inventory' || !held.on) fails.push('PH-14 [' + tag + '] a held icon names nothing: ' + JSON.stringify(held));
  await page.waitForTimeout(200);
  if (await page.$('[data-hs-win="inventory"]:not(.is-leaving)')) fails.push('PH-14 [' + tag + '] letting go of a held icon opened its window');
  const tipOff = await page.evaluate(() => getComputedStyle(document.querySelector('.hs-launch'), '::before').display);
  if (tipOff !== 'none') fails.push('PH-14 [' + tag + '] the hover tooltip still waits on the icon for a focus to stick it');
  /* A tap still opens at once, and no sheet shows a keyboard's chip. */
  await page.tap('.hs-launch[data-hs-open="shop"]', { timeout: 2500 }).catch(() => null);
  if (!(await wait(page, () => document.querySelector('[data-hs-win="shop"] [data-hs-built]'), null, 4000))) { fails.push('PH-14 [' + tag + '] a tap on an icon opened nothing'); return; }
  await page.waitForTimeout(250);
  const chips = await page.evaluate(() => Array.from(document.querySelectorAll('.hs-win-head .hs-key')).filter((k) => k.getClientRects().length).map((k) => k.textContent));
  if (chips.length) fails.push('PH-14 [' + tag + '] a sheet shows the key chip ' + chips.join(' '));
  /* A press on a grey Buy says why, on screen, beside it. */
  const buy = await page.evaluate(() => { const b = document.querySelector('[data-hs-win="shop"] [data-hs-act="buy"]:disabled'); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = window.__r(b); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  if (!buy) { fails.push('PH-14 [' + tag + '] CONTROL: no grey Buy with the purse emptied'); return; }
  await page.touchscreen.tap(buy.x, buy.y);
  await page.waitForTimeout(150);
  const said = await page.evaluate(() => { const e = document.querySelector('.hs-off-why'); return e && { text: e.textContent, on: window.__onScreen(window.__r(e)) }; });
  if (!said || !/You need/.test(said.text) || !said.on) fails.push('PH-14 [' + tag + '] a press on the grey Buy says ' + JSON.stringify(said));
}
/* ...in a hunt: the slot's reason first on its sheet, Tamsin's Take says why, every grey Take on her words. */
async function touchHunt(page, tag, fails) {
  const slot = await page.evaluate(() => { const s = Array.from(document.querySelectorAll('.hb-slot')).find((x) => x.querySelector('.hb-why').children.length); return s ? s.getAttribute('data-slot') : null; });
  if (slot === null) { fails.push('PH-14 [' + tag + '] CONTROL: no slot with a reason on the fixture\'s bar'); return; }
  await page.tap('.hb-slot[data-slot="' + slot + '"]', { timeout: 2500 }).catch(() => null);
  if (!(await wait(page, () => document.querySelector('[data-hs-win="configure-action"] .ca-rank'), null, 4000))) { fails.push('PH-14 [' + tag + '] a tap on the slot opened nothing'); return; }
  await page.waitForTimeout(250);
  const why = await page.evaluate(() => { const e = document.querySelector('.ca-why'), r = window.__r(e); return { text: e.textContent, on: !!r && window.__onScreen(r) }; });
  if (!why.text || !why.on) fails.push('PH-14 [' + tag + '] the slot\'s sheet does not say why it will not fire: ' + JSON.stringify(why));
  await page.tap('.ca-close', { timeout: 2500 }).catch(() => null);
  await page.waitForTimeout(250);
  await page.tap('.hs-launch[data-hs-open="tally"]', { timeout: 2500 }).catch(() => null);
  const line = await wait(page, () => { const l = document.querySelector('[data-hs-win="tally"] .ht-wait'); return !!l && l.getClientRects().length > 0 && /back in town/.test(l.textContent); }, null, 4000);
  if (!line) fails.push('PH-14 [' + tag + '] hunting, her board does not say why every Take is grey');
}

/* ── PH-15 ── One solid alert, clear of the card; the town's card clear of the hero. */
async function alertStack(page, tag, fails) {
  await wait(page, () => document.querySelector('.hw-alert'), null, 6000);
  await page.waitForTimeout(250);
  const a = await page.evaluate(() => { const list = Array.from(document.querySelectorAll('.hw-alert')); const shown = list.filter((e) => e.getClientRects().length);
    const card = document.querySelector('.hs-widget > .hs-pointer:not(.is-min)'); const more = document.querySelector('.hw-alerts-more');
    return { all: list.length, shown: shown.length, box: shown[0] ? window.__r(shown[0]) : null, bg: shown[0] ? getComputedStyle(shown[0]).backgroundColor : '', card: card ? window.__r(card) : null, more: more && more.textContent, moreOn: !!more && window.__onScreen(window.__r(more)), bar: window.__r('.hb-bar') }; });
  if (a.all < 3) { fails.push('PH-15 [' + tag + '] CONTROL: ' + a.all + ' alerts from three invites'); return; }
  if (a.shown !== 1) fails.push('PH-15 [' + tag + '] ' + a.shown + ' alerts stacked at phone size');
  if (/rgba?\([^)]*,\s*0?\.\d+\)|\/ 0?\.\d/.test(a.bg) || a.bg === 'transparent') fails.push('PH-15 [' + tag + '] the alert is see-through: ' + a.bg);
  if (a.more !== (a.all - 1) + ' more' || !a.moreOn) fails.push('PH-15 [' + tag + '] nothing counts the alerts waiting: ' + a.more);
  if (a.box && a.box.bottom > a.bar.top) fails.push('PH-15 [' + tag + '] the alert runs onto the bar');
  if (a.card && a.box && window_cross(a.card, a.box)) fails.push('PH-15 [' + tag + '] the card and the alert lie on each other: ' + JSON.stringify([a.card, a.box]));
}
async function townCard(page, tag, fails, vp) {
  const c = await page.evaluate(() => { const p = document.querySelector('.hs-launchers > .hs-pointer:not(.is-min)'); return p ? window.__r(p) : null; });
  if (!c) { fails.push('PH-15 [' + tag + '] CONTROL: no open card in town'); return; }
  const hero = { left: vp.width / 2 - 40, right: vp.width / 2 + 40, top: 0, bottom: vp.height };
  if (window_cross(c, hero)) fails.push('PH-15 [' + tag + '] the town\'s card lies on the hero\'s column: ' + JSON.stringify(c));
  if (!window_onScreen(c, vp)) fails.push('PH-15 [' + tag + '] the town\'s card runs off the screen: ' + JSON.stringify(c));
  const chrome = await page.evaluate(() => window.__r('.world-chrome'));
  if (chrome && c.top < chrome.bottom - 0.5) fails.push('PH-15 [' + tag + '] the town\'s card lies over the place\'s name');
}

/* ── PH-16 ── Words while waiting: the world's line and the connection's, a leave with no answer, a leave counting down. */
async function waitWords(browser, base, tag, vp, fails) {
  const ctx = await browser.newContext({ viewport: vp });
  try {
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    const s = scripted(ALPHA, (env) => { env.hunt = null; });
    await stub(page, s, false);
    /* The world's module never arrives: the pane stays on its line. */
    await page.route('**/src/world/world-boot.js*', () => undefined);
    await page.goto(base + '/play.html', { waitUntil: 'domcontentloaded', timeout: LOAD_MS * 2 });
    await wait(page, () => document.querySelector('form[data-auth="sign-in"], [data-app="play"]'));
    if (await page.$('form[data-auth="sign-in"]')) {
      await page.fill('input[name=email]', 'qa@example.test');
      await page.fill('input[name=password]', 'not-a-real-password');
      await page.click('.auth-submit');
    }
    await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
    await page.click('[data-app="play"][data-slot="0"]');
    if (!(await wait(page, () => document.querySelector('.world-status')))) { fails.push('PH-16 [' + tag + '] CONTROL: no waiting line'); return; }
    await ctx.setOffline(true);
    const off = await wait(page, () => /No connection/.test(document.querySelector('.world-status').textContent) && /No connection/.test((document.querySelector('.conn-line') || {}).textContent || ''), null, 3000);
    if (!off) fails.push('PH-16 [' + tag + '] offline, the wait reads: ' + JSON.stringify(await page.evaluate(() => [document.querySelector('.world-status').textContent, (document.querySelector('.conn-line') || {}).textContent])));
    await ctx.setOffline(false);
    const back = await wait(page, () => { const l = document.querySelector('.conn-line'); return !/No connection/.test(document.querySelector('.world-status').textContent) && (!l || l.hidden); }, null, 3000);
    if (!back) fails.push('PH-16 [' + tag + '] back online, the "no connection" words stayed');
  } finally { await ctx.close(); }
}
async function leaveWords(page, s, ctx, tag, fails) {
  s.holdLeave = true;
  await page.click('.ht-bar [data-hs-act="leave"]', { timeout: 2500 }).catch(() => null);
  const line = () => page.evaluate(() => (document.querySelector('.ht-leaving') || {}).textContent);
  const onBar = () => page.evaluate(() => { const l = document.querySelector('.ht-leaving'); return !!l && !l.hidden && window.__onScreen(window.__r(l)); });
  if (!(await wait(page, () => /^Leaving/.test((document.querySelector('.ht-leaving') || {}).textContent || ''), null, 2000))) fails.push('PH-16 [' + tag + '] the press reads: ' + await line());
  if (!(await wait(page, () => /Waiting for the server/.test(document.querySelector('.ht-leaving').textContent), null, 6000))) fails.push('PH-16 [' + tag + '] a leave with no answer still reads: ' + await line());
  if (!(await onBar())) fails.push('PH-16 [' + tag + '] the leave\'s words are not on screen');
  if (!(await wait(page, () => /Slow connection/.test((document.querySelector('.conn-line') || {}).textContent || ''), null, 8000))) fails.push('PH-16 [' + tag + '] an ask out for 8 s does not say the connection is slow');
  await ctx.setOffline(true);
  if (!(await wait(page, () => /No connection/.test(document.querySelector('.ht-leaving').textContent), null, 3000))) fails.push('PH-16 [' + tag + '] with the connection gone the leave reads: ' + await line());
  await ctx.setOffline(false);
}

/* ── PH-17 ── The door: no keyboard thrown up on a phone, links a thumb can hit, and the desktop keeps its focus. */
async function doorRule(browser, base, vp, phone, fails) {
  const tag = tagOf(vp);
  const ctx = await browser.newContext({ viewport: vp });
  try {
    const page = await ctx.newPage();
    await stub(page, scripted(ALPHA), false);
    await page.goto(base + '/play.html', { waitUntil: 'domcontentloaded', timeout: LOAD_MS * 2 });
    await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
    await page.waitForTimeout(200);
    const d = await page.evaluate(() => ({ focus: document.activeElement && document.activeElement.tagName, links: Array.from(document.querySelectorAll('.auth-link')).map((a) => a.getBoundingClientRect().height),
      over: document.scrollingElement.scrollHeight - innerHeight }));
    if (phone && d.focus === 'INPUT') fails.push('PH-17 [' + tag + '] the email box takes the focus: a phone throws its keyboard up');
    if (!phone && d.focus !== 'INPUT') fails.push('PH-17 [' + tag + '] a desktop lost the first field\'s focus (' + d.focus + ')');
    if (phone && (!d.links.length || Math.min(...d.links) < 44)) fails.push('PH-17 [' + tag + '] the links are ' + d.links.join(', ') + ' px tall (want >= 44)');
    if (phone && d.over > 0) fails.push('PH-17 [' + tag + '] the sign-in runs ' + d.over + ' px past the screen');
  } finally { await ctx.close(); }
}

async function rules(overrides, shots, { stopAtFirst = false, blocks = null } = {}) {
  /* `blocks`: a mutant runs only the pages its rule reads (BLOCKS_OF), so --mutate costs seconds a mutant, not the suite. */
  const run = (b) => !blocks || blocks.includes(b);
  const fails = [];
  const STOP = Symbol('first red');
  if (stopAtFirst) fails.push = function (...a) { Array.prototype.push.apply(this, a); throw STOP; };
  const { server, port } = await serve(Object.assign({}, WORLD_HOOK, overrides));
  const base = 'http://127.0.0.1:' + port;
  const browser = await leaseBrowser(chromium);
  const opened = [];
  const open = async (vp, fixture, prep, o = {}) => {
    const ctx = await browser.newContext(o.touch ? { viewport: vp, hasTouch: true, isMobile: true } : { viewport: vp });
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
    /* PH-6: the card under the hunt bar in a hunt, and under the icon row in town (no hunt: the hunt bar is gone). */
    const inTown = (env) => { longCoach(env); env.hunt = null; env.state = Object.assign({}, env.state, { active_kind: null, active_id: null }); };
    for (const vp of run('coach') ? [...PHONES, { width: 1440, height: 900 }] : []) {
      const tag = tagOf(vp);
      for (const [where, fixture, prep] of [['hunt', HUNT, longCoach], ['town', ALPHA, inTown]]) {
        const o = await open(vp, fixture, prep);
        if (!o.up) { fails.push('PH-6 [' + tag + '] the ' + where + ' did not mount'); await o.ctx.close(); continue; }
        await shot(o.page, 'coach-long-' + where + '-' + tag);
        await coachFits(o.page, tag + ' ' + where, fails, vp.width < 1024);
        await done(o, tag);
      }
    }
    for (const vp of run('fight') ? [{ width: 922, height: 423 }, { width: 844, height: 390 }, { width: 1440, height: 900 }] : []) { // PH-10
      const tag = tagOf(vp);
      const o = await open(vp, HUNT, (env) => { env.state = Object.assign({}, env.state, { level_xp: 0 }); }, { settle: 1500 });
      if (!o.up) { fails.push('PH-10 [' + tag + '] the hunt did not mount'); await o.ctx.close(); continue; }
      await shot(o.page, 'coach-fight-' + tag);
      await coachOffFight(o.page, tag, fails, vp.width < 1024, HUNT.party.members.map((m) => m.unit));
      await done(o, tag);
    }
    for (const vp of run('bar') ? PHONES : []) { // PH-7
      const tag = tagOf(vp);
      const o = await open(vp, HUNT);
      if (!o.up) { fails.push('PH-7 [' + tag + '] the hunt did not mount'); await o.ctx.close(); continue; }
      await shot(o.page, 'bar-' + tag);
      await barFits(o.page, tag, fails);
      await done(o, tag);
    }
    for (const vp of run('desk') ? [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }] : []) { // PH-8
      const tag = tagOf(vp);
      const o = await open(vp, HUNT);
      if (!o.up) { fails.push('PH-8 [' + tag + '] the hunt did not mount'); await o.ctx.close(); continue; }
      await shot(o.page, 'desk-bar-' + tag);
      await desktopBar(o.page, tag, fails);
      await done(o, tag);
    }
    if (run('stamina')) await staminaBuy(open, fails, done); // PH-9
    const townOnly = (env) => { env.hunt = null; env.state = Object.assign({}, env.state, { active_kind: null, active_id: null }); };
    for (const vp of run('strip') ? PHONES : []) { // PH-11, PH-12
      const tag = tagOf(vp);
      const o = await open(vp, ALPHA, townOnly);
      if (!o.up) { fails.push('PH-11 [' + tag + '] the town did not mount'); await o.ctx.close(); continue; }
      await shot(o.page, 'strip-' + tag);
      await stripReach(o.page, tag, fails);
      await done(o, tag);
      const two = await open(vp, ALPHA, (env) => { townOnly(env); twoHeroes(env); });
      if (!two.up) { fails.push('PH-12 [' + tag + '] the town did not mount'); await two.ctx.close(); continue; }
      await inviteByPress(two, tag, fails);
      await shot(two.page, 'all-characters-' + tag);
      await done(two, tag);
    }
    if (run('strip')) { // The desktop keeps its strip, its chips and its sheet.
      const o = await open({ width: 1440, height: 900 }, ALPHA, townOnly);
      if (o.up) {
        await o.page.click('.char-tool.is-all');
        await wait(o.page, () => document.querySelector('[data-hs-win="characters"] .hw-char'), null, 4000);
        const d = await o.page.evaluate(() => { const shown = (q) => Array.from(document.querySelectorAll(q)).filter((e) => e.getClientRects().length).length;
          return { phoneOnly: shown('.hw-phone-only') + shown('.hw-char-invite') + shown('.char-tool-short'), tools: shown('.char-tool'), chip: shown('.hs-win-head .hs-key'), left: window.__r('.hs-launchers').width }; });
        if (d.phoneOnly) fails.push('PH-11 [1440x900] the phone\'s routes show on a desktop');
        if (d.tools !== 3) fails.push('PH-11 [1440x900] the desktop strip has ' + d.tools + ' words, not its three');
        if (d.chip < 1) fails.push('PH-11 [1440x900] the desktop lost a window\'s key chip');
      } else fails.push('PH-11 [1440x900] the town did not mount');
      await done(o, '1440x900');
    }
    for (const vp of run('slots') ? [{ width: 667, height: 375 }] : []) { // PH-13
      const tag = tagOf(vp);
      const o = await open(vp, HUNT);
      if (!o.up) { fails.push('PH-13 [' + tag + '] the hunt did not mount'); await o.ctx.close(); continue; }
      await slotPage(o.page, tag, fails);
      await done(o, tag);
    }
    for (const vp of run('slots') ? [{ width: 667, height: 375 }, { width: 922, height: 423 }] : []) { // PH-13 chat
      const tag = tagOf(vp);
      const o = await open(vp, HUNT, null, { touch: true });
      if (!o.up) { fails.push('PH-13 [' + tag + '] the hunt did not mount'); await o.ctx.close(); continue; }
      await chatFoot(o.page, tag, fails);
      await shot(o.page, 'chat-' + tag);
      await done(o, tag);
    }
    if (run('slots')) {
      const o = await open({ width: 1440, height: 900 }, HUNT);
      if (o.up && await o.page.evaluate(() => { const b = document.querySelector('.hb-page'); return !!b && b.getClientRects().length > 0; })) fails.push('PH-13 [1440x900] the page press shows on a desktop');
      await done(o, '1440x900');
    }
    for (const vp of run('meaning') ? [{ width: 667, height: 375 }, { width: 922, height: 423 }] : []) { // PH-14
      const tag = tagOf(vp);
      const o = await open(vp, ALPHA, (env) => { townOnly(env); longBag(env); env.state = Object.assign({}, env.state, { gold: 0 }); if (env.account) env.account = Object.assign({}, env.account, { gold: 0 }); }, { touch: true });
      if (!o.up) { fails.push('PH-14 [' + tag + '] the town did not mount'); await o.ctx.close(); continue; }
      await touchMeaning(o.page, tag, fails);
      await shot(o.page, 'grey-why-' + tag);
      await done(o, tag);
      const h = await open(vp, HUNT, null, { touch: true });
      if (!h.up) { fails.push('PH-14 [' + tag + '] the hunt did not mount'); await h.ctx.close(); continue; }
      await touchHunt(h.page, tag, fails);
      await done(h, tag);
    }
    for (const vp of run('stack') ? [{ width: 667, height: 375 }, { width: 922, height: 423 }] : []) { // PH-15
      const tag = tagOf(vp);
      const invites = (env) => { env.party_invites = [1, 2, 3].map((n) => ({ id: '00000000-0000-4000-8000-00000000000' + n, hunt: 'mill_cellar', from: 'Mira' })); };
      const o = await open(vp, HUNT, invites);
      if (!o.up) { fails.push('PH-15 [' + tag + '] the hunt did not mount'); await o.ctx.close(); continue; }
      await alertStack(o.page, tag + ' hunt', fails);
      await shot(o.page, 'alert-over-card-' + tag);
      await done(o, tag);
      const t = await open(vp, ALPHA, (env) => { townOnly(env); longCoach(env); townOnly(env); });
      if (!t.up) { fails.push('PH-15 [' + tag + '] the town did not mount'); await t.ctx.close(); continue; }
      await townCard(t.page, tag, fails, vp);
      await shot(t.page, 'town-card-' + tag);
      await done(t, tag);
    }
    for (const vp of run('waits') ? [{ width: 667, height: 375 }] : []) { // PH-16
      const tag = tagOf(vp);
      await waitWords(browser, base, tag, vp, fails);
      const o = await open(vp, HUNT);
      if (!o.up) { fails.push('PH-16 [' + tag + '] the hunt did not mount'); await o.ctx.close(); continue; }
      await leaveWords(o.page, o.s, o.ctx, tag, fails);
      await o.ctx.close();
      const c = await open(vp, HUNT, (env) => { env.hunt.session = Object.assign({}, env.hunt.session, { id: env.hunt.session_id, leave_at: new Date(env.hunt_server_now_ms + 90000).toISOString(), phase: 'leaving' }); });
      if (!c.up) { fails.push('PH-16 [' + tag + '] the leaving hunt did not mount'); await c.ctx.close(); continue; }
      const why = await c.page.evaluate(() => { const w = document.querySelector('.ht-why'), r = window.__r(w), bar = window.__r('.ht-bar'); return { text: w.textContent, on: !!r && window.__onScreen(r), clear: !!r && r.top >= bar.bottom - 0.5, sized: !!r && parseFloat(getComputedStyle(w).fontSize) >= 12 }; });
      if (!why.text || !why.on || !why.clear || !why.sized) fails.push('PH-16 [' + tag + '] a counting leave does not say what the wait is for: ' + JSON.stringify(why));
      await shot(c.page, 'leave-why-' + tag);
      await done(c, tag);
    }
    if (run('door')) { // PH-17
      for (const vp of PHONES) await doorRule(browser, base, vp, true, fails);
      await doorRule(browser, base, { width: 1440, height: 900 }, false, fails);
    }
    if (shots && !blocks) await moreShots(open, shot);
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
const BLOCKS_OF = Object.freeze({ 'PH-1': ['configure'], 'PH-2': ['hunt'], 'PH-3': ['portrait'], 'PH-4': ['town'], 'PH-5': ['town'], 'PH-6': ['coach'], 'PH-7': ['bar'], 'PH-8': ['desk'], 'PH-9': ['stamina'], 'PH-10': ['fight'], 'PH-11': ['strip'], 'PH-12': ['strip'], 'PH-13': ['slots'], 'PH-14': ['meaning'], 'PH-15': ['stack'], 'PH-16': ['waits'], 'PH-17': ['door'] });
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
  /* the card's cap is the fallback where round() or lh is missing (the words' box is the tighter cap in Chromium): undo both */
  ['PH-6 nothing caps the phone coach', 'src/styles/shell.css', 'flex-direction: column; max-height: calc(var(--coach-room) - 20px); }\n  .hs-pointer:not(.is-min) > .hs-coach-text {\n    min-height: 0; max-height: calc(round(down, var(--coach-room) - 42px - 1.5lh, 1lh) + .5lh);',
    'flex-direction: column; }\n  .hs-pointer:not(.is-min) > .hs-coach-text {\n    min-height: 0;'],
  ['PH-6 the coach\'s room is never measured', 'src/shell/shell.js', '    publishInset();\n    roomForCoach();\n', '    publishInset();\n'],
  /* re-anchored 10-25 (lane/b-widget-move-fold): the coach's own thin scrollbar left for the game's one scrollbar (app.css) */
  ['PH-6 the coach\'s words take no thumb', 'src/styles/shell.css', '    pointer-events: auto;', ''],
  ['PH-6 the coach\'s words end on a whole line', 'src/styles/shell.css', 'max-height: calc(round(down, var(--coach-room) - 42px - 1.5lh, 1lh) + .5lh);', ''],
  ['PH-6 the whole card scrolls, its fold with it', 'src/styles/shell.css', 'display: flex; flex-direction: column; max-height: calc(var(--coach-room) - 20px); }', 'max-height: calc(var(--coach-room) - 20px); overflow-y: auto; pointer-events: auto; }'],
  ['PH-7 the slots never give way, so the panel runs off a small phone', 'src/styles/hunt.css', '  .hb-grid { order: 1; display: flex; gap: 2px; min-width: 0; overflow-x: auto;', '  .hb-grid { order: 1; display: flex; gap: 2px; min-width: max-content; overflow-x: visible;'],
  ['PH-7 the phone stance folds away', 'src/styles/hunt.css', '  .hb-pl-row.is-stance { grid-area: stance; min-height: 0; }', '  .hb-pl-row.is-stance { display: none; }'],
  ['PH-7 the stamina + takes no press', 'src/styles/hunt.css', '.hb-stam-buy { position: relative; width: 36px;', '.hb-stam-buy { pointer-events: none; position: relative; width: 36px;'],
  ['PH-7 the phone ring carries the desktop words', 'src/styles/hunt.css', '  .hb-lv-k, .hb-xp-k { display: none; }', '  .hb-lv-k, .hb-xp-k { }'],
  ['PH-8 the slot icons stay x1 on a desktop', 'src/styles/hunt.css', '.hb-slot .hh-icon, .hb-socket-ico .hh-icon { width: round(down, 100% - 4px, 32px); height: round(down, 100% - 4px, 32px); }', '.hb-slot .hh-icon, .hb-socket-ico .hh-icon { width: 32px; height: 32px; }'],
  ['PH-8 the ring is the pixel medallion again', 'src/styles/hunt.css', '.hb-medal { grid-area: medal; align-self: start; position: relative; width: 120px; height: 120px; }', '.hb-medal { grid-area: medal; align-self: start; position: relative; width: 120px; height: 120px; background: url(../../assets/ui/bar-medal.png) center / 100% 100% no-repeat; }'],
  ['PH-8 the ring words run onto the ring', 'src/styles/hunt.css', 'justify-content: center; gap: 1px; line-height: 1;', 'justify-content: center; gap: 12px; line-height: 1;'],
  ['PH-8 the stance folds away on a desktop', 'src/styles/hunt.css', '.hb-stance { display: flex; width: 100%; }', '.hb-stance { display: none; width: 100%; }'],
  ['PH-9 the refill sends a price of its own', 'src/shell/widgets/stamina-buy.js', 'cs.buyStamina(q.price)', 'cs.buyStamina(q.price + 1)'],
  ['PH-9 the premium note shows to premium heroes too', 'src/shell/widgets/stamina-buy.js', "cls(box.querySelector('.hb-buy-premium'), 'is-on', !isPremium(cs));", "cls(box.querySelector('.hb-buy-premium'), 'is-on', true);"],
  ['PH-9 a refused refill loses its words', 'src/shell/widgets/stamina-buy.js', "s.msg = r.ok ? 'Stamina restored.' : refusalWords(r.error);", "s.msg = r.ok ? 'Stamina restored.' : '';"],
  ['PH-9 Buy stays on when a refill cannot be bought', 'src/shell/widgets/stamina-buy.js', "prop(go, 'disabled', !!why || s.pending);", "prop(go, 'disabled', s.pending);"],
  ['PH-9 Buy stays on while the refill is in flight', 'src/shell/widgets/stamina-buy.js', "prop(go, 'disabled', !!why || s.pending);", "prop(go, 'disabled', !!why);"],
  ['PH-9 the stamina panel is wider than a phone', 'src/styles/hunt.css', '.hb-buy { display: none; position: absolute; bottom: calc(100% + 6px); width: 280px;', '.hb-buy { display: none; position: absolute; bottom: calc(100% + 6px); width: 900px;'],
  ['PH-10 the phone card hangs at the hunt bar\'s left end, over the hero', 'src/styles/shell.css', '  .hs-widget.is-hunt-topbar > .hs-pointer { left: auto; right: 0; }\n', ''],
  ['PH-10 the camera frames the fight under the card', 'src/shell/shell.js', '    const card = phoneMq.matches && worldHud', '    const card = false && worldHud'],
  ['PH-11 the icon row keeps its 44 px at 667, over the strip\'s word', 'src/styles/shell.css', '  .hs-launchers { padding-left: 4px; max-width: calc(100vw - 60px); }', '  .hs-launchers { padding-left: 4px; }'],
  ['PH-11 the tabs squash to a sliver', 'src/styles/app.css', '  @container char-strip (max-width: 150px) { .char-tabs { display: none; } }\n', '  .char-tab { min-width: 0; width: 12px; padding: 0; }\n'],
  ['PH-11 the three words stay in the strip', 'src/styles/app.css', '  .char-tool:not(.is-all), .char-tool-wide { display: none; }', '  .char-tool-wide { display: none; }'],
  ['PH-11 the sheet names no icons', 'src/shell/windows/characters.js', '    + iconListHtml(ctx)\n', ''],
  ['PH-11 no way to sign out on a phone', 'src/shell/windows/characters.js', '    + ACCOUNT_HTML\n', ''],
  ['PH-11 the phone\'s routes show on a desktop', 'src/styles/windows.css', '.hw-phone-only, .hw-char-invite { display: none; }', '.hw-phone-only { display: block; } .hw-char-invite { display: none; }'],
  ['PH-12 no Invite on the other hero', 'src/shell/windows/characters.js', "prop(inv, 'hidden', !can);", "prop(inv, 'hidden', true);"],
  ['PH-12 the sheet still says right-click', 'src/shell/windows/characters.js', "(ctx.isPhone && ctx.isPhone() ? 'Press Invite", "(false ? 'Press Invite"],
  ['PH-13 no page press', 'src/shell/widgets/action-bar.js', "    prop(press, 'hidden', !over);\n", ''],
  ['PH-13 the page press goes nowhere', 'src/shell/widgets/action-bar.js', "  grid.scrollLeft = atEnd(grid) ? 0 : grid.scrollWidth;\n", ''],
  ['PH-13 the chat\'s box starts below the screen', 'src/styles/hunt.css', '  .hs-win[data-hs-win="chat"] .hc-chat { flex: 1; min-height: 0; }\n', '  .hs-win[data-hs-win="chat"] .hc-chat { min-height: 520px; }\n'],
  ['PH-13 the icon\'s tooltip stays on a tapped sheet', 'src/styles/shell.css', '  .hs-win-head .hs-key, .hs-launch::before { display: none; }\n', '  .hs-win-head .hs-key { display: none; }\n'],
  ['PH-14 a held icon says nothing', 'src/shell/launcher-names.js', 'swallow = true; show(icon); }', 'swallow = true; }'],
  ['PH-14 letting go of a held icon opens it', 'src/shell/launcher-names.js', "function onClick(e) { if (swallow && ", "function onClick(e) { if (false && "],
  ['PH-14 the key chips stay on touch', 'src/styles/shell.css', ':root.is-touch .hs-win-head .hs-key, :root.is-touch .hs-launch::before { display: none; }', ':root.is-touch .hs-launch::before { display: none; }'],
  ['PH-14 a grey button says nothing', 'src/shell/off-why.js', "if (words) show(b, words); else hide();", "hide();"],
  ['PH-14 a slot\'s sheet does not say why', 'src/shell/windows/configure-action.js', "text(root.querySelector('.ca-why'), fireWhy ? fireWhy.text : '');", ''],
  ['PH-14 her board does not say why while it is loaded', 'src/shell/windows/tally.js', "'is-on', !sc.board || st.hunting);", "'is-on', !sc.board);"],
  ['PH-15 every alert stacks on a phone', 'src/styles/windows.css', '  .hw-alert-list > .hw-alert:not(:first-child) { display: none; }\n', ''],
  ['PH-15 the alert is see-through', 'src/styles/windows.css', 'padding: 0 0 0 10px; background: var(--bg-2); }', 'padding: 0 0 0 10px; }'],
  ['PH-15 nothing counts the alerts behind', 'src/styles/windows.css', '  .hw-alerts-more:not(:empty) { display: block; }\n', ''],
  ['PH-15 the card runs under the alert', 'src/shell/shell.js', "const shared = alert && w.matches('.is-hunt-topbar') ? alert.getBoundingClientRect().top - 8 : floor;", 'const shared = floor;'],
  ['PH-15 the town\'s card hangs on the hero', 'src/styles/shell.css', '  .hs-launchers > .hs-pointer { left: auto; right: calc(100vw - 268px); }\n', ''],
  ['PH-16 the world waits in silence', 'src/app/world-pane.js', 'statusEl.textContent = loadingWords(connection.state(), Date.now() - waitFrom, firstWords);', 'statusEl.textContent = firstWords;'],
  ['PH-16 no connection line', 'src/app/boot.js', 'mountConnectionLine(doc), ', ''],
  ['PH-16 the connection line never clears', 'src/net/connection.js', "    line.hidden = s === 'ok';\n", '    if (s !== \'ok\') line.hidden = false;\n'],
  ['PH-16 a leave with no answer stays on "Leaving"', 'src/shell/widgets/hunt-topbar.js', "return waitedMs >= WAIT_WORDS_MS ? LEAVE_WAIT.slow : LEAVING", "return LEAVING"],
  ['PH-16 a leave does not know the connection went', 'src/shell/widgets/hunt-topbar.js', "  if (state === 'lost') return LEAVE_WAIT.lost;\n", ''],
  ['PH-16 a counting leave does not say why', 'src/shell/widgets/hunt-topbar.js', "prop(el.querySelector('.ht-why'), 'hidden', over || !cd || cd.phase !== 'counting');", ''],
  ['PH-17 the email box throws the keyboard up', 'src/app/sign-in.js', "if (!win || !win.matchMedia('(pointer: coarse), ' + MOBILE_QUERY).matches) input.focus();", 'input.focus();'],
  ['PH-17 a desktop loses its focus', 'src/app/sign-in.js', "if (!win || !win.matchMedia('(pointer: coarse), ' + MOBILE_QUERY).matches) input.focus();", 'void win;'],
  ['PH-17 the links are 24 px', 'src/styles/app.css', '  .auth-link { min-height: var(--tap); padding: 0 8px; }\n', ''],
  ['PH-6 the coach is capped on a desktop too', 'src/styles/shell.css', '.hs-pointer:not(.is-min) { padding-right: 34px; }', '.hs-pointer:not(.is-min) { padding-right: 34px; max-height: 200px; overflow-y: auto; }'],
];

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'phone-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  /* --only PH-n: that rule's pages alone (a fast loop on one rule; the gate runs them all). */
  const oi = process.argv.indexOf('--only');
  const blocks = oi > 0 ? BLOCKS_OF[process.argv[oi + 1]] : null;
  if (oi > 0 && !blocks) { console.log('phone-touch: --only takes one of ' + Object.keys(BLOCKS_OF).join(' ')); process.exit(2); }
  if (!process.argv.includes('--mutate')) {
    const fails = await rules(null, shots, { blocks });
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'phone-touch: ' + fails.length + ' rule(s) RED' : 'phone-touch: the configure sheet scrolls with Save in reach, Hunt details toggles and the analyzer closes clear of the hunt bar, portrait asks to turn, Settings and the bag answer a thumb, a long coach ends above the action bar and never lies on the fight, the phone bar keeps every fight control in reach, the desktop bar keeps its 64 px icons, the stamina + buys at the server\'s quote' + (shots ? ' (shots in ' + shots + ')' : ''));
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
