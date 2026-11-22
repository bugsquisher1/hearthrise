#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/top-bar.mjs — THE TOP BAR STAYS SHORT, AND EVERY WINDOW IS STILL TWO PRESSES AWAY (Tyler 2026-11-16).
//
//   node tests/top-bar.mjs                 the rules
//   node tests/top-bar.mjs --mutate        every planted defect must turn a named rule RED
//   node tests/top-bar.mjs --mutate --only=<name fragment>   just those mutants, after the clean control (a local re-check)
//   node tests/top-bar.mjs --shots <dir>   also write the bar and each group's menu at each size
//
// mutant-anchors: src/data/shell-windows.js src/shell/launcher.js src/shell/launcher-coach.js src/shell/launcher-menu.js src/styles/shell.css src/styles/app.css src/shell/widgets/action-bar.js src/shell/shell.js src/render/paint.js src/styles/hunt.css src/shell/windows/hunt-detail.js
//
// Tyler 2026-11-16: "Our top menu bar is starting to get long again, are there some things we can either combine or move to clean
// it up? It's getting a bit overwhelming." The row had grown back to 19 icons (WORLD_SHELL.md §1 started at 8). The windows a player
// opens now and then moved one press under a group's icon (src/data/shell-windows.js LAUNCHER_GROUPS: Town, Social, Menu); every key
// stayed. play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs) on tests/fixtures/alpha-envelope.json.
//   TB-1  (no browser) THE ROW IS SHORT: the plan (launcher-menu.js barPlan) holds at most BAR_MAX buttons for any hero, a Game Master too;
//         every group is in LAUNCHER_GROUPS and holds two windows or more (a group of one is a wasted press); every window with an
//         icon is in the row or in exactly one group
//   TB-2  (no browser) THE RING'S WAY: a card whose way starts at a grouped window's icon rings that window's line in the open menu,
//         else its group's icon; a card at a window in the row rings that icon alone
//   TB-3  EVERY WINDOW IN TWO PRESSES (1440x900, 922x423 and 667x375, a touch screen on the phones): the row's buttons are each on
//         screen, a thumb wide, and overlap nothing; every window the row reaches opens by mouse (or tap) in one or two presses and
//         the menu shuts behind the pick; every window with a key opens by that key in one press (Esc: Settings; Enter: Chat); Hunt
//         prep opens from the bar's setup press, the Hunts page's door and P; the bar's press is named Hunt prep (P) with the window's
//         glyph, never the tick, and its hover chip stands above the bar; the Hunts door reads Hunt prep (Tyler 2026-11-17); zero console errors
//   TB-4  THE MENU BEHAVES (1440x900): a press opens it (aria-expanded), a second press shuts it; Esc shuts it and opens nothing;
//         a press on the World shuts it; a key that opens a window shuts it; a pick of the window already on top shuts it and
//         leaves that window open; the arrows walk its lines; an envelope that changes nothing, and a row redrawn for a reason under
//         the open menu (its card read), both leave the keyboard on the same line
//   TB-5  THE COACH'S RING STILL LANDS (1440x900 and 922x423): a new hero's "Tamsin's rats" rings the Town icon, the menu opened
//         rings Tamsin's line, and her window opened from there carries the card; never two rings at once; the row draws the ring
//         itself, so no paint rewrites the markup the row already has (2.5 s round a repeated envelope, the menu shut and open; a card
//         that moved on may redraw it)
//   TB-6  A PHONE'S MENU IS A SHEET (922x423 and 667x375): it stands at the right edge under the row, as tall as the screen allows,
//         every line inside it at a thumb's height, none cut, no text under 12 px; never a bottom bar
//   TB-7  A MENU NEVER LIES OVER THE COACH'S PRESSES (1440x900, 1440x420 and 922x423; the Coordinator's read 2026-11-16: the Town menu covered
//         the card's Got it): with a card up in town, each group's menu open, no visible press of the card (Got it, Don't show tips,
//         fold, close) overlaps the menu, and each still takes its press (the topmost element at its middle is its own). Both of the
//         desktop card's places: docked in the World's right column (1440x900, hud-room.js dockTownCoach), and hung under the row when
//         the column has no room for it (1440x420 under a full Tally): each steps left of the open menu by its own rule (shell.css)
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, UID, serve, SDK_STUB } from './_client-harness.mjs';
import { pinFonts } from './_test-fonts.mjs';
import { withServerLevel } from './_server-level.mjs';
import { pressBar, groupOf, barReach } from './_bar.mjs';

const src = (p) => import(pathToFileURL(join(ROOT, p)).href);

/* The row's most buttons: Hunts, Bag, Character, Skills, the Book and one icon a group (Tyler 2026-11-16, the Coordinator's ~7). */
export const BAR_MAX = 8;

const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const wait = (page, fn, arg, ms = 20000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const SIZES = [{ width: 1440, height: 900, touch: false }, { width: 922, height: 423, touch: true }, { width: 667, height: 375, touch: true }];

/* A hero in town who has hunted nothing yet, with Tamsin's board offering her rats: the "Tamsin's rats" card is the coach's. */
function fresh(e) {
  for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party', 'hunt_bests']) delete e[k];
  e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, level_xp: 0 });
  for (const k of Object.keys(e.skills)) if (['melee', 'defense', 'inner_flame', 'magic', 'ranged'].includes(k)) e.skills[k] = { xp: 0, level: 1 };
  e.tally = { held: [], paid_today: 0, per_day: 10, held_max: 3, weight: null, order: [], recent: [], day_ends_at: '2099-01-01T00:00:00Z' };
}
function town(e) {
  for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events']) delete e[k];
  e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null });
}
/* ...with three of Tamsin's tasks held: her Tally fills the top of the World's right column, so on a short desktop World the coach card has no
   room under it and hangs under the icon row instead (TB-7). */
function townFullTally(e) {
  town(e);
  e.tally = { held: [1, 2, 3].map((place) => ({ place, task: 'cellar_giant_rats', hunt: 'mill_cellar', monster: 'rat', kills: place, target: 120, keep: false, done: false })),
    paid_today: 0, per_day: 3, held_max: 3, weight: null, order: [], recent: [], day_ends_at: '2099-01-01T00:00:00Z' };
}
/* TB-7's sizes, each with where its card must stand (the 141 release run 44476966121: since the dock's mark moved to the row's widget, the
   card stays docked with a menu open, so a 1440x900 run never reached the rule for a card hung under the row); a phone's card is its own */
const TB7 = [Object.assign({ prep: town, docked: true }, SIZES[0]), Object.assign({ prep: townFullTally, docked: false }, SIZES[0], { height: 420 }), Object.assign({ prep: town, docked: null }, SIZES[1])];

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await pinFonts(page);
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    /* like the real server, a residue put comes back in every later envelope (client_state): a repeated envelope is truly the same */
    if (name === 'hr_put_client_state') { try { Object.assign(s.residue, JSON.parse(r.request().postData() || '{}').p_patch || {}); } catch { /* not JSON: kept as it was */ } return json({ ok: true }); }
    if (name === 'hr_load' || name === 'hr-accrue') return json(Object.assign(withServerLevel(clone(s.env)), { version: ++s.version, ok: true, client_state: clone(s.residue) }));
    return json({ ok: true });
  });
}
async function signInAndPlay(page, base) {
  await page.goto(base + '/play.html', { waitUntil: 'load', timeout: 45000 });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
  await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('.hs-launchers .hs-launch'));
}

const openWins = (page) => page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win]:not(.is-leaving)')).map((w) => w.getAttribute('data-hs-win')));
/* Close every window (Esc closes the top one; with none open it would open Settings) and shut any menu. Chat stands open from the
   start and Esc passes it by (window-manager.js onEscape), so it stays: the loop ends when it is all that is left. */
async function closeAll(page) {
  await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });   // a caret in Chat's field would take the next key
  for (let i = 0; i < 5 && (await openWins(page)).some((w) => w !== 'chat'); i++) {
    await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(170);
  }
  if (await page.$('.hs-launch-menu')) { await page.keyboard.press('Escape'); await page.waitForTimeout(80); }
}
const opened = (page, id) => wait(page, (w) => !!document.querySelector('[data-hs-win="' + w + '"]:not(.is-leaving)'), id, 3000);
/* A press a mutant may take away: false, never a thrown run (a missing control is a red rule, named by its caller). */
const tryPress = (page, q, touch) => (touch ? page.tap(q, { timeout: 2500 }) : page.click(q, { timeout: 2500 })).then(() => true, () => false);
const ringed = (page) => page.evaluate(() => Array.from(document.querySelectorAll('[data-coach-ring]')).filter((e) => e.getClientRects().length)
  .map((e) => e.getAttribute('data-hs-open') || (e.getAttribute('data-hs-group') ? 'group:' + e.getAttribute('data-hs-group') : e.className)));

/* `firstRed`: a mutant run stops at the first section that goes red (a verdict needs one named rule, not all of them). */
async function checks(overrides, shots, firstRed = false) {
  const fails = [];
  const { SHELL_WINDOWS, LAUNCHER_GROUPS } = await src('src/data/shell-windows.js');
  if (!overrides) { // TB-1, TB-2 (pure: a mutant of these files is read by the page rules below)
    const L = await src('src/shell/launcher-coach.js');
    const { barPlan } = await src('src/shell/launcher-menu.js');
    const icons = SHELL_WINDOWS.filter((r) => r.launcher !== false);
    const plan = barPlan(icons);
    if (plan.length > BAR_MAX) fails.push('TB-1 the row holds ' + plan.length + ' buttons for a Game Master with every section on, over ' + BAR_MAX);
    const ids = new Set(LAUNCHER_GROUPS.map((g) => g.id));
    for (const e of plan) if (e.group && e.rows.length < 2) fails.push('TB-1 the ' + e.group.id + ' group holds ' + e.rows.length + ' window: a group of one is a wasted press');
    for (const r of icons) if (r.group && !ids.has(r.group)) fails.push('TB-1 ' + r.id + ' names no group');
    const reached = plan.flatMap((e) => (e.row ? [e.row.id] : e.rows.map((r) => r.id)));
    for (const r of icons) if (reached.filter((x) => x === r.id).length !== 1) fails.push('TB-1 ' + r.id + ' is reached ' + reached.filter((x) => x === r.id).length + ' times by the row');
    const T = await src('src/data/hunt-tutorial.js');
    const tally = T.HUNT_TUTORIAL.find((c) => c.anchor === 'tally'), hunts = T.HUNT_TUTORIAL.find((c) => c.anchor === 'hunt_picker');
    const shut = { open: () => false };
    const a = L.ringPlan(tally, shut), b = L.ringPlan(hunts, shut);
    if (a.join() !== '.hs-launchers [data-hs-open="tally"],.hs-launchers [data-hs-group="' + groupOf('tally') + '"]') fails.push('TB-2 a card at Tamsin\'s tally rings ' + JSON.stringify(a));
    if (b.join() !== '.hs-launchers [data-hs-open="hunts"]') fails.push('TB-2 a card at Hunts rings ' + JSON.stringify(b));
  }
  const { server, port } = await serve(overrides);
  const browser = await leaseBrowser(chromium);
  const open = async (size, prep, residue) => {
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: !!size.touch, isMobile: false });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const env = clone(BASE_ENV);
    prep(env);
    const s = { env, version: 1, residue: residue || {} };
    await stub(page, s);
    const up = await signInAndPlay(page, 'http://127.0.0.1:' + port);
    return { ctx, page, errors, up, s };
  };
  const tag = (s) => s.width + 'x' + s.height;
  /* The server says the last thing again (a settle that moved nothing): the shell paints, and the row has nothing new to draw. */
  const sayAgain = (page, s) => { const env = Object.assign(withServerLevel(clone(s.env)), { version: ++s.version, ok: true, client_state: clone(s.residue) });
    return page.evaluate(([uid, e]) => window.__hub.send('hr:' + uid + ':0', { t: 'state', frame: e.version, env: e }), [UID, env]); };
  try {
    { // TB-4
      const { ctx, page, up, s } = await open(SIZES[0], town);
      if (!up) fails.push('TB-4 the World never came up');
      else {
        const menu = () => page.evaluate(() => { const m = document.querySelector('.hs-launch-menu'); const g = document.querySelector('[data-hs-group][aria-expanded="true"]');
          return m ? (g ? g.getAttribute('data-hs-group') : 'no-expanded') : null; });
        await tryPress(page, '[data-hs-group="social"]');
        if ((await menu()) !== 'social') fails.push('TB-4 a press on Social opened ' + JSON.stringify(await menu()));
        await tryPress(page, '[data-hs-group="social"]');
        await page.waitForTimeout(100);
        if ((await menu()) !== null) fails.push('TB-4 a second press left the menu open');
        await tryPress(page, '[data-hs-group="town"]');
        /* Chat stands open from the start (chat-social CW-12): Esc over the menu shuts the menu and leaves the windows as they were */
        const was = JSON.stringify(await openWins(page));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
        if ((await menu()) !== null || JSON.stringify(await openWins(page)) !== was) fails.push('TB-4 Esc over the open menu left ' + JSON.stringify({ menu: await menu(), windows: await openWins(page), was: JSON.parse(was) }) + ', want it shut and nothing opened or closed');
        await tryPress(page, '[data-hs-group="town"]');
        /* a press on the bare World: a point the World itself takes, under no window (Chat stands open at its home from the start,
           CW-12, over the point 400,450 this pressed, and a press on a window is not a press elsewhere) */
        const bare = await page.evaluate(() => {
          for (const [x, y] of [[720, 450], [900, 560], [1040, 330], [620, 640], [400, 450]]) {
            const el = document.elementFromPoint(x, y);
            if (el && el.closest('#panel-world') && !el.closest('[data-hs-win], .hs-launchers, [data-hs-widget]')) return [x, y];
          }
          return null;
        });
        if (!bare) fails.push('TB-4 no point of the World is bare at 1440x900 to press');
        else await page.mouse.click(bare[0], bare[1]);
        await page.waitForTimeout(150);
        if (bare && (await menu()) !== null) fails.push('TB-4 a press on the World left the menu open');
        await tryPress(page, '[data-hs-group="town"]');
        await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
        await page.keyboard.press('m');
        if (!(await opened(page, 'market')) || (await menu()) !== null) fails.push('TB-4 M with the menu open: market ' + (await openWins(page)).join(',') + ', menu ' + (await menu()));
        /* a pick of the window already on top opens nothing new, and the menu still shuts behind it (the line opens, never toggles) */
        await tryPress(page, '[data-hs-group="town"]');
        await tryPress(page, '.hs-launch-menu [data-hs-open="market"]');
        await page.waitForTimeout(150);
        if ((await menu()) !== null || !(await openWins(page)).includes('market')) fails.push('TB-4 a pick of the Market already open left ' + JSON.stringify({ menu: await menu(), windows: await openWins(page) }) + ', want it open and the menu shut');
        await closeAll(page);
        await page.focus('[data-hs-group="town"]', { timeout: 2500 }).catch(() => null);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        const at = await page.evaluate(() => { const a = document.activeElement; return a ? a.getAttribute('data-hs-open') : null; });
        const second = (await page.evaluate(() => Array.from(document.querySelectorAll('.hs-launch-menu .hs-launch-item')).map((b) => b.getAttribute('data-hs-open'))))[1];
        if (!second || at !== second) fails.push('TB-4 two ArrowDowns from the Town icon focus ' + at + ', want its second line ' + second);
        /* an envelope that changes nothing leaves the menu as it was: open, the keyboard on the same line */
        await sayAgain(page, s);
        await page.waitForTimeout(400);
        const kept = await page.evaluate(() => { const a = document.activeElement; return a ? a.getAttribute('data-hs-open') : null; });
        if (kept !== at || (await menu()) !== 'town') fails.push('TB-4 an envelope with nothing new took the keyboard from ' + at + ' to ' + kept + ' (menu ' + (await menu()) + ')');
        /* the row redrawn for a reason under the open menu (the card read on the server's word: a late section does the same) keeps the
           keyboard on that line too */
        const card = await page.evaluate(() => { const p = document.querySelector('.hs-launchers .hs-pointer'); document.querySelector('.hs-launchers').__old = true; return p ? p.getAttribute('data-tutorial') : null; });
        if (!card) fails.push('TB-4 CONTROL: no coach card in the row to move on');
        else {
          /* the card moved on as its Got it moves it (launcher.js actCoach): read for a card that teaches, hidden for this visit for one the
             server finishes (visitOf: the hunt's session, in it or home; Sell junk since 2026-11-20) */
          const coach = Object.assign({}, s.residue.coach || {}), h = s.env.hunt;
          const visit = (h && h.session_id ? String(h.session_id).slice(0, 56) : 'none') + (h && h.hunt_id && !h.ended ? ':in' : ':town');
          s.residue = Object.assign({}, s.residue, { coach: Object.assign(coach, { read: (coach.read || []).concat([card]), hid: (coach.hid || []).concat([card]), hidIn: visit }) });
          await sayAgain(page, s);
          await page.waitForTimeout(400);
          const after = await page.evaluate(() => ({ redrawn: !document.querySelector('.hs-launchers').__old, at: document.activeElement ? document.activeElement.getAttribute('data-hs-open') : null }));
          if (!after.redrawn) fails.push('TB-4 CONTROL: the card ' + card + ' read on the server\'s word did not redraw the row');
          else if (after.at !== at || (await menu()) !== 'town') fails.push('TB-4 the row redrawn under the open menu took the keyboard from ' + at + ' to ' + after.at + ' (menu ' + (await menu()) + ')');
        }
        await page.keyboard.press('Enter');
        if (!(await opened(page, second || 'market'))) fails.push('TB-4 Enter on a focused line did not open ' + second);
      }
      await ctx.close();
      if (firstRed && fails.length) return fails;
    }
    for (const size of SIZES.slice(0, 2)) { // TB-5
      const { ctx, page, up, s } = await open(size, fresh, { coach: { read: ['styles'] } });
      if (!up) { fails.push('TB-5 [' + tag(size) + '] the World never came up'); await ctx.close(); continue; }
      await page.waitForTimeout(600);
      const card = await page.evaluate(() => { const p = document.querySelector('.hs-launchers .hs-pointer'); return p ? p.getAttribute('data-tutorial') : null; });
      if (card !== 'tamsins_rats') { fails.push('TB-5 [' + tag(size) + '] CONTROL: the new hero\'s card is ' + card + ', not tamsins_rats'); await ctx.close(); continue; }
      const r0 = await ringed(page);
      if (r0.join() !== 'group:' + groupOf('tally')) fails.push('TB-5 [' + tag(size) + '] with the menu shut the ring is on ' + JSON.stringify(r0) + ', want the ' + groupOf('tally') + ' icon alone');
      /* The row draws the ring itself, where the coach would put it, so a paint finds the row unchanged and leaves it be: rings
         that only the coach set (src/shell/launcher.js ringCoach) make every paint rebuild the row. Watched 2.5 s round an envelope that
         repeats the last one. */
      const rebuilt = () => {
        /* Only a rebuild that wrote the markup already there counts (the bug class): a card that moved on or a section that landed late
           changes the row and may redraw it. The coach's ring is set on the live row, so it is left out of the comparison. */
        const watch = page.evaluate(() => new Promise((ok) => { const box = document.querySelector('.hs-launchers').parentElement;
          const plain = () => box.innerHTML.replace(/ data-coach-ring=""/g, '');
          let n = 0, was = plain(), at = '';
          const mo = new MutationObserver((rs) => { if (!rs.some((r) => r.type === 'childList' && r.target === box)) return;
            const now = plain(); if (now === was) { n++; if (!at) at = now.slice(0, 120); } was = now; });
          mo.observe(box, { childList: true });
          setTimeout(() => { mo.disconnect(); ok(n ? n + ' (' + JSON.stringify(at) + ')' : 0); }, 2500); }));
        return page.waitForTimeout(500).then(() => sayAgain(page, s)).then(() => watch);
      };
      /* A row rebuilt for a reason carries its ring already: the coach (ringCoach) never has to add or move one after it. */
      const churn = (act) => {
        const watch = page.evaluate(() => new Promise((ok) => { const box = document.querySelector('.hs-launchers').parentElement, seen = [];
          const mo = new MutationObserver((rs) => { for (const r of rs) seen.push((r.target.getAttribute('data-hs-open') || 'group:' + r.target.getAttribute('data-hs-group'))
            + (r.target.hasAttribute('data-coach-ring') ? ' ringed' : ' unringed')); });
          mo.observe(box, { attributes: true, attributeFilter: ['data-coach-ring'], subtree: true });
          setTimeout(() => { mo.disconnect(); ok(seen.join(', ')); }, 1600); }));
        return page.waitForTimeout(200).then(act).then(() => watch);
      };
      const moved0 = await churn(async () => { await page.keyboard.press('h'); await page.waitForTimeout(400); await page.keyboard.press('Escape'); });
      if (moved0) fails.push('TB-5 [' + tag(size) + '] Hunts opened and shut, the row came back and the coach had to ring it: ' + moved0);
      const still0 = await rebuilt();
      if (still0) fails.push('TB-5 [' + tag(size) + '] with the menu shut a repeated envelope rebuilt the row with the markup it already had: ' + still0);
      const moved1 = await churn(() => tryPress(page, '[data-hs-group="' + groupOf('tally') + '"]', size.touch));
      if (moved1) fails.push('TB-5 [' + tag(size) + '] the menu opened and the coach had to move its ring: ' + moved1);
      const r1 = await ringed(page);
      if (r1.join() !== 'tally') fails.push('TB-5 [' + tag(size) + '] with the menu open the ring is on ' + JSON.stringify(r1) + ', want Tamsin\'s line alone');
      const still1 = await rebuilt();
      if (still1) fails.push('TB-5 [' + tag(size) + '] with the menu open a repeated envelope rebuilt the row with the markup it already had: ' + still1);
      if (shots) await page.screenshot({ path: join(shots, 'ring-' + tag(size) + '.png') });
      if (!(await tryPress(page, '.hs-launch-menu [data-hs-open="tally"]', size.touch))) fails.push('TB-5 [' + tag(size) + '] the open menu holds no line for her tally');
      else if (!(await opened(page, 'tally'))) fails.push('TB-5 [' + tag(size) + '] Tamsin\'s line did not open her tally');
      else {
        await page.waitForTimeout(400);
        const inWin = await page.evaluate(() => { const p = document.querySelector('[data-hs-win="tally"] > .hs-win-coach .hs-pointer'); return p ? p.getAttribute('data-tutorial') : null; });
        if (inWin !== 'tamsins_rats') fails.push('TB-5 [' + tag(size) + '] her window holds the card ' + inWin);
      }
      await ctx.close();
      if (firstRed && fails.length) return fails;
    }
    for (const size of TB7) { // TB-7
      const { ctx, page, up } = await open(size, size.prep);
      if (!up) { fails.push('TB-7 [' + tag(size) + '] the World never came up'); await ctx.close(); continue; }
      await page.waitForTimeout(400);
      const presses = () => page.evaluate(() => Array.from(document.querySelectorAll('.hs-pointer button')).filter((b) => b.getClientRects().length && !b.closest('[hidden]')).length);
      if (!(await presses())) { fails.push('TB-7 [' + tag(size) + '] CONTROL: no coach card with a press is up in town'); await ctx.close(); continue; }
      const docked = await page.evaluate(() => { const w = document.querySelector('[data-hs-widget="launchers"]'); return !!w && w.classList.contains('is-coach-docked'); });
      if (size.docked !== null && docked !== size.docked) { fails.push('TB-7 [' + tag(size) + '] CONTROL: the card is ' + (size.docked ? 'not docked' : 'docked') + ' here, so this size proves nothing of its rule'); await ctx.close(); continue; }
      /* TB-8 EVERY ICON SAYS ITS NAME OVER THE CARD (QA audit 2026-11-18 N5: hovering the row's icons showed no name: the coach card under the row
         painted over each name chip). With the card up, a hovered icon's chip is shown and stacks above the card (the same stacking box, .hs-launchers). */
      if (!size.touch && size.docked !== false) for (const id of await barReach(page)) {
        const q = id.startsWith('group:') ? '.hs-launchers [data-hs-group="' + id.slice(6) + '"]' : '.hs-launchers > .hs-launch[data-hs-open="' + id + '"]';
        await page.hover(q);
        /* the chip fades in (shell.css, opacity over 120 ms): read it once the fade has ended, up to 1.5 s, never at a fixed 160 ms
           (staging run 44870672285 read 0.9986 on three icons there, z 11 over the card's 5: a fade still running, not a chip under it) */
        await page.waitForFunction((s) => getComputedStyle(document.querySelector(s), '::before').opacity === '1', q, { timeout: 1500 }).catch(() => {});
        const chip = await page.evaluate((s) => { const b = document.querySelector(s), c = getComputedStyle(b, '::before'), p = document.querySelector('.hs-launchers > .hs-pointer');
          return { tip: b.getAttribute('data-tip'), opacity: c.opacity, z: c.zIndex, card: p ? getComputedStyle(p).zIndex : null }; }, q);
        if (!chip.tip || chip.opacity !== '1' || !(chip.card === null || Number(chip.z) > Number(chip.card))) fails.push('TB-8 [' + tag(size) + '] ' + id + '\'s name chip hides under the coach card: ' + JSON.stringify(chip));
      }
      await page.mouse.move(2, size.height - 2);
      for (const g of (await barReach(page)).filter((x) => x.startsWith('group:')).map((x) => x.slice(6))) {
        await closeAll(page);
        if (!(await tryPress(page, '.hs-launchers [data-hs-group="' + g + '"]', size.touch))) { fails.push('TB-7 [' + tag(size) + '] the ' + g + ' icon took no press'); continue; }
        await page.waitForTimeout(250);
        const hit = await page.evaluate(() => {
          const m = document.querySelector('.hs-launch-menu');
          if (!m) return { menu: false };
          const r = m.getBoundingClientRect();
          const bs = Array.from(document.querySelectorAll('.hs-pointer button')).filter((b) => b.getClientRects().length && !b.closest('[hidden]'));
          const bad = bs.filter((b) => { const q = b.getBoundingClientRect(); const over = q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top;
            const top = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return over || !(top && (top === b || b.contains(top))); })
            .map((b) => (b.textContent.trim() || b.getAttribute('data-hs-act')) + ' ' + JSON.stringify([Math.round(b.getBoundingClientRect().left), Math.round(b.getBoundingClientRect().right)]));
          return { menu: true, n: bs.length, bad, at: [Math.round(r.left), Math.round(r.right)] };
        });
        if (!hit.menu) fails.push('TB-7 [' + tag(size) + '] a press on ' + g + ' opened no menu');
        else if (!hit.n) fails.push('TB-7 [' + tag(size) + '] with the ' + g + ' menu open the coach card has no press left on screen');
        else if (hit.bad.length) fails.push('TB-7 [' + tag(size) + '] the ' + g + ' menu ' + JSON.stringify(hit.at) + ' lies over the coach card\'s ' + hit.bad.join(', '));
        if (shots && size.width === 1440) await page.screenshot({ path: join(shots, 'menu-' + g + '-over-card-' + tag(size) + '.png') });
      }
      await ctx.close();
      if (firstRed && fails.length) return fails;
    }
    for (const size of SIZES) { // TB-3, TB-6
      const { ctx, page, errors, up } = await open(size, town);
      if (!up) { fails.push('TB-3 [' + tag(size) + '] the World never came up'); await ctx.close(); continue; }
      await page.waitForTimeout(400);
      const row = await page.evaluate(() => {
        const r = (e) => { const q = e.getBoundingClientRect(); return { l: q.left, r: q.right, t: q.top, b: q.bottom, w: q.width }; };
        const bs = Array.from(document.querySelectorAll('.hs-launchers > .hs-launch, .hs-launchers > .hs-launch-group > .hs-launch'));
        return { n: bs.length, boxes: bs.map(r), vw: innerWidth, vh: innerHeight,
          reach: bs.map((b) => b.getAttribute('data-hs-open') || 'group:' + b.getAttribute('data-hs-group')) };
      });
      if (row.n > BAR_MAX) fails.push('TB-3 [' + tag(size) + '] the row shows ' + row.n + ' buttons, over ' + BAR_MAX);
      const small = size.touch ? 39.5 : 39.5;
      for (const [i, q] of row.boxes.entries()) {
        if (q.w < small || q.l < 0 || q.r > row.vw + 0.5 || q.t < 0) fails.push('TB-3 [' + tag(size) + '] ' + row.reach[i] + ' is ' + Math.round(q.w) + ' px wide or off screen');
        const next = row.boxes[i + 1];
        if (next && next.l < q.r - 0.5) fails.push('TB-3 [' + tag(size) + '] ' + row.reach[i] + ' and ' + row.reach[i + 1] + ' overlap');
      }
      if (shots) await page.screenshot({ path: join(shots, 'bar-' + tag(size) + '.png') });
      /* TB-1 in the page: each group's menu lists two windows or more */
      for (const g of row.reach.filter((x) => x.startsWith('group:')).map((x) => x.slice(6))) {
        await closeAll(page);
        if (!(await tryPress(page, '[data-hs-group="' + g + '"]', size.touch))) { fails.push('TB-1 [' + tag(size) + '] the ' + g + ' icon took no press'); continue; }
        await page.waitForTimeout(120);
        const n = await page.evaluate(() => document.querySelectorAll('.hs-launch-menu .hs-launch-item').length);
        if (n < 2) fails.push('TB-1 [' + tag(size) + '] the ' + g + ' menu lists ' + n + ' window: a group of one is a wasted press');
      }
      /* every window the row reaches, in two presses or fewer */
      const want = SHELL_WINDOWS.filter((r) => r.launcher !== false && !r.gm && !r.section).map((r) => r.id);
      for (const id of want) {
        await closeAll(page);
        let presses = 0;
        try { presses = await pressBar(page, id, { tap: size.touch }); } catch (e) { fails.push('TB-3 [' + tag(size) + '] ' + id + ' has no way in from the row: ' + String(e.message).split('\n')[0]); continue; }
        if (!(await opened(page, id))) fails.push('TB-3 [' + tag(size) + '] ' + presses + ' presses from the row did not open ' + id);
        else if (presses > 2) fails.push('TB-3 [' + tag(size) + '] ' + id + ' took ' + presses + ' presses');
        if (await page.$('.hs-launch-menu')) fails.push('TB-3 [' + tag(size) + '] the menu stayed open after ' + id + ' was picked');
        /* TB-9 ONE TICK COLOUR (UI audit 2026-11-18: the bag's Advanced view and All characters' alert boxes drew the browser's blue): every box,
           choice and slider in the window is the gold token */
        const ticks = await page.evaluate((w) => { const p = document.createElement('i'); p.style.color = 'var(--gold)'; document.body.appendChild(p); const gold = getComputedStyle(p).color; p.remove();
          return Array.from(document.querySelectorAll('[data-hs-win="' + w + '"] input:is([type="checkbox"], [type="radio"], [type="range"])')).filter((c) => getComputedStyle(c).accentColor !== gold)
            .map((c) => (c.closest('label') ? c.closest('label').textContent.trim().slice(0, 30) : c.className) + ': ' + getComputedStyle(c).accentColor); }, id);
        if (ticks.length) fails.push('TB-9 [' + tag(size) + '] ' + id + ' draws ticks off the gold token: ' + JSON.stringify(ticks.slice(0, 4)));
        if (shots && presses === 2 && id === want.find((x) => groupOf(x) === groupOf(id))) {
          await closeAll(page);
          await tryPress(page, '.hs-launchers [data-hs-group="' + groupOf(id) + '"]', size.touch);
          await page.waitForTimeout(250);
          await page.screenshot({ path: join(shots, 'menu-' + groupOf(id) + '-' + tag(size) + '.png') });
        }
      }
      /* TB-6 the phone's menu is a sheet */
      if (size.touch) {
        await closeAll(page);
        await tryPress(page, '.hs-launchers [data-hs-group="town"]', true);
        await page.waitForTimeout(250);
        const m = await page.evaluate(() => {
          const el = document.querySelector('.hs-launch-menu');
          if (!el) return null;
          const r = el.getBoundingClientRect(), row = document.querySelector('.hs-launchers').getBoundingClientRect();
          const lines = Array.from(el.querySelectorAll('.hs-launch-item')).map((b) => { const q = b.getBoundingClientRect(); const s = b.querySelector('.hs-launch-label');
            return { h: q.height, cut: s.scrollWidth > s.clientWidth + 1, in: q.top >= r.top - 0.5 && q.bottom <= r.bottom + 0.5, fs: parseFloat(getComputedStyle(s).fontSize) }; });
          return { right: Math.round(innerWidth - r.right), top: Math.round(r.top - row.bottom), bottom: Math.round(innerHeight - r.bottom), lines };
        });
        if (!m) fails.push('TB-6 [' + tag(size) + '] a tap on Town opened no menu');
        else {
          if (m.right !== 0 || Math.abs(m.top) > 1 || m.bottom !== 0) fails.push('TB-6 [' + tag(size) + '] the menu is not a sheet at the right under the row: ' + JSON.stringify({ right: m.right, top: m.top, bottom: m.bottom }));
          const bad = m.lines.filter((l) => l.h < 44 || l.cut || !l.in || l.fs < 12);
          if (!m.lines.length || bad.length) fails.push('TB-6 [' + tag(size) + '] a menu line is under a thumb\'s height, cut, outside the sheet or under 12 px: ' + JSON.stringify(bad[0] || 'no lines'));
        }
      }
      /* every key, one press */
      for (const r of SHELL_WINDOWS.filter((x) => x.key && x.launcher !== false && !x.gm && !x.section)) {
        await closeAll(page);
        await page.keyboard.press(r.key === 'escape' ? 'Escape' : r.key === 'enter' ? 'Enter' : r.key);
        if (!(await opened(page, r.id))) fails.push('TB-3 [' + tag(size) + '] its key ' + r.key + ' did not open ' + r.id);
      }
      /* Hunt prep: no icon, the bar's setup press and P. THE PRESS SAYS IT IS HUNT PREP (Tyler 2026-11-17: "how do i access the hunt
         prep"; a tick that read as a confirm): its name and key for a reader, the window's own glyph (never the tick), and on a mouse
         the icon row's name chip ("Hunt prep  P") on hover, standing above the bar inside the screen */
      await closeAll(page);
      const door = await page.evaluate((row) => {
        const b = document.querySelector('[data-hs-widget="action-bar"] [data-hs-act="setups"]');
        if (!b) return null;
        const d = (b.querySelector('svg path') || { getAttribute: () => '' }).getAttribute('d');
        return { label: b.getAttribute('aria-label'), tip: b.getAttribute('data-tip'), key: b.getAttribute('data-key'),
          glyph: d === window.HR_GLYPHS[row.glyph], tick: d === window.HR_GLYPHS.uiCheck };
      }, SHELL_WINDOWS.find((x) => x.id === 'hunt-prep'));
      if (!door || door.label !== 'Hunt prep (P)' || door.tip !== 'Hunt prep' || door.key !== 'P' || !door.glyph || door.tick) {
        fails.push('TB-3 [' + tag(size) + '] the bar\'s setup press does not say Hunt prep: ' + JSON.stringify(door));
      }
      if (!size.touch) {
        await page.hover('[data-hs-widget="action-bar"] [data-hs-act="setups"]', { timeout: 2500 }).catch(() => null);
        await page.waitForTimeout(250);
        const chip = await page.evaluate(() => {
          const b = document.querySelector('[data-hs-widget="action-bar"] [data-hs-act="setups"]'), s = getComputedStyle(b, '::before');
          const r = b.getBoundingClientRect(), h = parseFloat(s.height) || 0, bottom = parseFloat(s.bottom);
          return { words: s.content, shown: s.opacity === '1' && s.display !== 'none', above: Number.isFinite(bottom) && bottom > 0, top: Math.round(r.top - bottom - h) };
        });
        if (!/Hunt prep/.test(chip.words) || !/P/.test(chip.words) || !chip.shown || !chip.above || chip.top < 0) fails.push('TB-3 [' + tag(size) + '] hovering the setup press shows no Hunt prep chip above the bar: ' + JSON.stringify(chip));
        await page.mouse.move(2, 200);
      }
      await page.click('[data-hs-widget="action-bar"] [data-hs-act="setups"]', { timeout: 2500 }).catch(() => null);
      if (!(await opened(page, 'hunt-prep'))) fails.push('TB-3 [' + tag(size) + '] the bar\'s setup press did not open Hunt prep');
      /* ...and the door under a ground's Go as says the same name, and opens it */
      await closeAll(page);
      await page.keyboard.press('h');
      if (await opened(page, 'hunts')) {
        await tryPress(page, '.hw-hunt[data-hunt="mill_cellar"]', size.touch);
        const words = await wait(page, () => { const b = document.querySelector('.hw-go-prep'); return b && b.getClientRects().length; }, null, 3000)
          ? await page.evaluate(() => document.querySelector('.hw-go-prep').textContent) : null;
        if (words !== 'Hunt prep') fails.push('TB-3 [' + tag(size) + '] the Hunts page\'s door to Hunt prep reads ' + JSON.stringify(words));
        else if (!(await tryPress(page, '.hw-go-prep', size.touch)) || !(await opened(page, 'hunt-prep'))) fails.push('TB-3 [' + tag(size) + '] the Hunts page\'s Hunt prep door did not open it');
      } else fails.push('TB-3 [' + tag(size) + '] H did not open Hunts');
      await closeAll(page);
      await page.keyboard.press('p');
      if (!(await opened(page, 'hunt-prep'))) fails.push('TB-3 [' + tag(size) + '] P did not open Hunt prep');
      if (errors.length) fails.push('TB-3 [' + tag(size) + '] console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
      if (firstRed && fails.length) return fails;
    }
  } finally {
    server.close();
  }
  return fails;
}

/* Each plants one defect the rules above exist for. [name, file, from, to] */
const MUTANTS = [
  ['Tamsin\'s tally back in the row', 'src/data/shell-windows.js', "id: 'tally', label: 'Tamsin\\'s tally', key: 'q', group: 'town',", "id: 'tally', label: 'Tamsin\\'s tally', key: 'q',"],
  ['the Menu group holds Settings alone', 'src/data/shell-windows.js', "id: 'report', label: 'Report a problem', key: 'f', group: 'menu',", "id: 'report', label: 'Report a problem', key: 'f', launcher: false,"],
  ['a pick leaves the menu open', 'src/shell/launcher-menu.js', "if (ev.type === 'click') { setMenu(ctx, el, null, draw); if (tab) ctx.wm.openTab(id, tab); else ctx.wm.open(id); return true; }", "if (ev.type === 'click') { if (tab) ctx.wm.openTab(id, tab); else ctx.wm.open(id); return true; }"],
  ['a window opened by key leaves the menu open', 'src/shell/launcher-menu.js', '  if (m && m.seen !== openKey(ctx.wm)) { MENU.delete(ctx.wm); return null; }', ''],
  ['Esc over the menu opens Settings too', 'src/shell/launcher-menu.js', '    e.preventDefault(); e.stopPropagation();\n    shut(true);', '    shut(true);'],
  ['a press elsewhere leaves the menu open', 'src/shell/launcher-menu.js', "  doc.addEventListener('pointerdown', (e) => { if (!(e.target.closest && e.target.closest('.hs-launch-group.is-menu'))) shut(false); }, true);", ''],
  ['the name chips hide under the coach card (TB-8, QA audit 2026-11-18 N5)', 'src/styles/shell.css', 'top: calc(100% + 6px); right: 0; z-index: 11;', 'top: calc(100% + 6px); right: 0;'],
  ['the ticks are the browser\'s blue again (TB-9, UI audit 2026-11-18)', 'src/styles/app.css', ':where(input[type="checkbox"], input[type="radio"], input[type="range"]) { accent-color: var(--gold); }\n', ''],
  ['the arrows do not walk the menu', 'src/shell/launcher-menu.js', '      items[to].focus();', '      void to;'],
  ['the row leaves the group\'s ring to the coach, so every paint rebuilds it', 'src/shell/launcher.js', "+ (inside && !shown ? ' data-coach-ring=\"\"' : '')", "+ ''"],
  ['the group keeps its ring while its menu is open', 'src/shell/launcher.js', "+ (inside && !shown ? ' data-coach-ring=\"\"' : '')", "+ (inside ? ' data-coach-ring=\"\"' : '')"],
  ['the ring\'s way never reaches the group', 'src/shell/launcher-coach.js', "group ? ['.hs-launchers [data-hs-group=\"' + group + '\"]'] : []", '[]'],
  ['the phone\'s menu is a dropdown, not a sheet', 'src/styles/shell.css', '    position: fixed; top: 40px; right: 0; bottom: 0; width: min(400px, 48vw);', '    width: min(400px, 48vw);'],
  ['the phone\'s menu lines lose a thumb\'s height', 'src/styles/shell.css', '  .hs-launch-item { grid-template-columns: 20px 1fr; gap: 8px; min-height: var(--tap); padding: 0 6px; }', '  .hs-launch-item { grid-template-columns: 20px 1fr; gap: 8px; min-height: 30px; padding: 0 6px; }'],
  ['every paint rebuilds the row, so an envelope takes the keyboard off the open menu', 'src/shell/shell.js', '      else markup(el, render(ctx));', "      else { const html = render(ctx); if (el.innerHTML !== html) el.innerHTML = html; }"],
  ['the menu opens past the row\'s record, so the next paint rebuilds it', 'src/shell/launcher-menu.js', '  if (el.isConnected) markup(el, draw(ctx));', '  if (el.isConnected) el.innerHTML = draw(ctx);'],
  /* the card hung under the row (1440x420, the column full under the Tally) */
  ['the coach card stays under the open menu', 'src/styles/shell.css', '.hs-launchers:where(:has(> .hs-launch-group.is-menu)) > .hs-pointer { right: max(calc(100% - 46px), calc(100% - var(--hs-menu-left, 100%) + 8px)); }\n', ''],
  /* the card docked in the World's right column (1440x900): its own rule steps it left of the open menu */
  ['the docked coach card stays under the open menu', 'src/styles/shell.css', '.is-coach-docked > .hs-launchers:has(> .hs-launch-group.is-menu) > .hs-pointer { right: max(var(--coach-r), calc(100% - var(--hs-menu-left, 100%) + 8px)); }\n', ''],
  ['the open menu is never measured, so the card cannot dock clear', 'src/shell/launcher-menu.js', '  if (!id) return;\n  dockClear(el);\n', '  if (!id) return;\n'],
  ['a row redrawn under the open menu drops the keyboard', 'src/render/paint.js', "  if (back && typeof back.focus === 'function') back.focus();\n", ''],
  ['Hunt prep loses the bar\'s setup press', 'src/shell/widgets/action-bar.js', "  if (action === 'setups' && ev.type === 'click') { ctx.show('hunt-prep'); return; }", ''],
  ['the bar\'s Hunt prep press is a tick again', 'src/shell/widgets/action-bar.js', "glyphSvg(g, PREP.glyph)", "glyphSvg(g, 'uiCheck')"],
  ['the bar\'s Hunt prep press loses its name', 'src/shell/widgets/action-bar.js', "aria-label=\"' + esc(PREP.label) + (key ? ' (' + esc(key) + ')' : '') + '\"'", "aria-label=\"Saved setups: switch or save\"'"],
  ['the Hunt prep chip hangs under the bar, off the screen', 'src/styles/hunt.css', '.hb-plaque .hb-prep::before { top: auto; bottom: calc(100% + 6px); }\n', ''],
  ['the Hunts page calls Hunt prep something else', 'src/shell/windows/hunt-detail.js', 'esc(PREP_LABEL)', "'Change setups'"],
];

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'top-bar-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null, shots);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'top-bar: ' + fails.length + ' rule(s) RED'
      : 'top-bar: ' + BAR_MAX + ' buttons at most; every window two presses from the row and one by its key at 1440x900, 922x423 and 667x375; the menu shuts as a menu should; the coach rings the group, then the line; a phone\'s menu is a sheet');
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await checks(null);
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  let bad = 0;
  const only = (process.argv.find((x) => x.startsWith('--only=')) || '').slice(7);
  const chosen = MUTANTS.filter(([name]) => name.includes(only));
  if (!chosen.length) { console.log('  ✗ HARNESS: no mutant matches --only=' + only); process.exit(2); }
  for (const [name, file, from, to] of chosen) {
    const text = (await readFile(join(ROOT, file), 'utf8')).replace(/\r\n/g, '\n');
    if (text.split(from).length !== 2) { console.log('  ✗ ' + name + ' — anchor not found once in ' + file); bad++; continue; }
    const fails = await checks({ [file]: text.replace(from, () => to) }, null, true);
    if (fails.length && fails.every((f) => /^TB-\d/.test(f))) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
    else if (fails.length) { console.log('  ✗ ' + name + ' — red by no named rule: ' + fails[0]); bad++; }
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  console.log(bad ? 'top-bar --mutate: ' + bad + ' escaped' : 'top-bar --mutate: ' + chosen.length + '/' + chosen.length + ' mutants caught' + (only ? ' (--only=' + only + ', of ' + MUTANTS.length + ')' : ''));
  process.exit(bad ? 1 : 0);
}

main();
