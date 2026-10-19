#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/window-camera.mjs — WINDOWS NEVER MOVE EACH OTHER, THE WORLD OR THE HERO; RIGHT-CLICK WORKS.
//
//   node tests/window-camera.mjs           the rules, in a real Chromium
//   node tests/window-camera.mjs --mutate  every planted defect must turn a rule RED
//
// mutant-anchors: src/shell/window-manager.js src/shell/shell.js src/world/render/canvas-backend.js src/styles/world.css
// mutant-writes-tree: no — mutants are served overrides
//
// Tyler's playtest, 2026-10-18 (v0.2.1), on play.html with supabase-js and the
// REST paths stubbed (tests/_client-harness.mjs), the character standing in
// town (tests/fixtures/alpha-envelope.json). The hero is PINNED (the idle walk to
// its station is pushed out of the test's reach by a served override) so the
// camera moves only for the reason a rule is about.
//   WC-1  THE X CLOSES: with Hunt prep | Hunt settings | Gathering and crafting
//         docked side by side, a real press and release on Hunt settings' X
//         closes it; the other two keep their exact rects; presses on a window's
//         head (a hand's few px of wander included) move no window; a reopen comes
//         back to its rect
//   WC-2  CLICKS IN A WINDOW NEVER MOVE THE WORLD: three presses inside a docked
//         window leave the camera and the hero where they were; the stage and the
//         pane cannot be scrolled (a focused control past the edge would scroll
//         the canvas with them)
//   WC-3  WINDOWS FLOAT OVER THE WORLD (Tyler 2026-10-19): opening, clicking and
//         closing a docked window, a second docked window and the Configure action
//         modal leave the canvas rect and the camera unchanged on every frame
//   WC-4  RIGHT-CLICK: a real right-click on another player in town (on the
//         figure or on the name over it) opens the player menu, and the
//         browser's own menu is suppressed there
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { launchOptions } from './_chrome.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';

const FIXTURE = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const ANDY = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const PEER = 'Bartholomew Underhill';   // a long name: its ends lie beyond the figure's box
const PEER_AT = [13, 9];

/* Read-only hooks, served (never written to the tree): the World pane's runtime on window.__world,
   and the hero pinned where it stands (the idle walk to its station never comes inside a test). */
const PANE = 'src/app/world-pane.js', STATIONS = 'src/data/world/stations.js';
const paneSrc = await readFile(join(ROOT, PANE), 'utf8');
const stationSrc = await readFile(join(ROOT, STATIONS), 'utf8');
if (!paneSrc.includes('    runtime.sync();\n') || !stationSrc.includes('export const IDLE_TO_STATION_MS = ')) throw new Error('window-camera: a hook anchor moved');
const HOOKS = {
  [PANE]: paneSrc.replace('    runtime.sync();\n', '    runtime.sync();\n    window.__world = runtime;\n'),
  [STATIONS]: stationSrc.replace(/export const IDLE_TO_STATION_MS = \d+;/, 'export const IDLE_TO_STATION_MS = 3600000;'),
};

function townEnv() {
  const e = clone(FIXTURE);
  for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
  e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null });
  return e;
}

async function stub(page) {
  let version = 1;
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load') return json(Object.assign(townEnv(), { version: ++version }));
    if (name === 'hr-accrue') return json({ accrued: false });
    if (name === 'hr_town_walkers') return json({ ok: true, map: body.p_map, cap: 40, walkers: [
      { id: ANDY, slot: 0, name: PEER, level: 9, role: 'healer', x: PEER_AT[0], y: PEER_AT[1], gx: PEER_AT[0], gy: PEER_AT[1], dir: 'w', age_ms: 0 }] });
    if (name === 'hr_chat_recent') return json({ ok: true, zone: 'local:town', party: null, lines: [] });
    if (name === 'hr_social_state') return json({ ok: true, friends: [], incoming: [], outgoing: [], blocks: [] });
    if (name === 'hr_whispers_recent') return json({ ok: true, lines: [] });
    return json({ ok: true });
  });
}

const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

async function enter(browser, base, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await stub(page);
  await page.goto(base + '/play.html', { waitUntil: 'load' });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
  await page.click('[data-app="play"][data-slot="0"]');
  const up = await wait(page, () => window.__world && window.__world.stats().walk && document.querySelector('.hs-launchers'));
  await page.waitForTimeout(400);
  return { ctx, page, errors, up };
}

/* Each live window's rect, rounded, by id. */
const rects = (page) => page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('[data-hs-win]:not(.is-leaving)'))
  .map((w) => { const r = w.getBoundingClientRect(); return [w.getAttribute('data-hs-win'), [r.left, r.top, r.width, r.height].map(Math.round).join(',')]; })));
/* Where the camera is: the map's corner tile on screen; and the hero's cell. */
const camera = (page) => page.evaluate(() => { const p = window.__world.screenOf(0, 0); return Math.round(p.x) + ',' + Math.round(p.y); });
const hero = (page) => page.evaluate(() => window.__world.stats().walk.cell.join(','));
/* A real press and release at the middle of an element. */
async function press(page, sel, jitter = 0) {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) throw new Error('no ' + sel);
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  /* a hand is never still: a click that wanders a few px is still a click */
  if (jitter) { await page.mouse.move(x + jitter, y + 1); await page.mouse.move(x + jitter / 2, y); }
  await page.mouse.up();
}
const settle = (page) => page.waitForTimeout(350);

async function checks(overrides) {
  const fails = [];
  const { server, port } = await serve(Object.assign({}, HOOKS, overrides || {}));
  const base = 'http://127.0.0.1:' + port;
  const browser = await chromium.launch(launchOptions({ headless: true }));
  try {
    { // WC-1, WC-2 on a wide screen (three windows dock side by side inside 60% of the World)
      const { ctx, page, errors, up } = await enter(browser, base, { width: 2560, height: 1200 });
      if (!up) fails.push('WC-1 the town did not mount');
      else {
        for (const k of ['p', 'j', 'g']) { await page.keyboard.press(k); await settle(page); }
        const r0 = await rects(page);
        if (Object.keys(r0).sort().join() !== 'hunt-prep,hunt-settings,skills-trade') fails.push('WC-1 three docked windows did not open: ' + JSON.stringify(r0));
        else {
          const c0 = await camera(page), h0 = await hero(page);
          /* WC-2: presses inside a window (its head, its body) move no window, no camera, no hero. */
          for (const sel of ['[data-hs-win="hunt-settings"] .hs-win-title', '[data-hs-win="hunt-prep"] .hs-win-title', '[data-hs-win="hunt-settings"] .hs-win-title']) { await press(page, sel, 3); await page.waitForTimeout(120); }
          await settle(page);
          if (JSON.stringify(await rects(page)) !== JSON.stringify(r0)) fails.push('WC-1 presses inside windows moved the dock: ' + JSON.stringify(await rects(page)) + ' vs ' + JSON.stringify(r0));
          if ((await camera(page)) !== c0) fails.push('WC-2 three presses inside a window moved the camera from ' + c0 + ' to ' + (await camera(page)));
          if ((await hero(page)) !== h0) fails.push('WC-2 three presses inside a window moved the hero from ' + h0 + ' to ' + (await hero(page)));
          /* A focused control past an overflow box's edge makes the browser scroll that box; neither may scroll. */
          const scrolled = await page.evaluate(async () => {
            const stage = document.querySelector('#panel-world .world-stage'), pane = document.querySelector('#panel-world');
            /* a control past the stage's right edge (in the windows' layer) and one past the pane's, focused like a click would */
            const inStage = document.createElement('button');
            inStage.style.cssText = 'position:absolute;left:calc(100% + 300px);top:calc(100% + 200px);pointer-events:auto';
            document.querySelector('[data-hs-layer]').appendChild(inStage);
            const inPane = document.createElement('div');
            inPane.style.cssText = 'flex:none;margin-left:150%;margin-top:400px;width:40px;height:40px';
            inPane.innerHTML = '<button>x</button>';
            pane.appendChild(inPane);
            inStage.focus();
            await new Promise((ok) => requestAnimationFrame(ok));
            const a = [stage.scrollLeft, stage.scrollTop];
            inPane.firstChild.focus();
            await new Promise((ok) => requestAnimationFrame(ok));
            const out = a.concat([pane.scrollLeft, pane.scrollTop]);
            inStage.remove(); inPane.remove();
            return out;
          });
          if (scrolled.some((n) => n !== 0)) fails.push('WC-2 the World can be scrolled under a window (stage, pane): ' + scrolled.join(','));
          /* WC-1: the X closes on a real press and release; the others keep their rects. */
          await press(page, '[data-hs-win="hunt-settings"] [data-hs-close]');
          await settle(page);
          const r1 = await rects(page);
          if (r1['hunt-settings']) fails.push('WC-1 a press on Hunt settings’ X did not close it: ' + JSON.stringify(r1));
          if (r1['hunt-prep'] !== r0['hunt-prep'] || r1['skills-trade'] !== r0['skills-trade']) fails.push('WC-1 closing one window moved the others: ' + JSON.stringify(r1) + ' vs ' + JSON.stringify(r0));
          await page.keyboard.press('j'); await settle(page);
          const r2 = await rects(page);
          if (r2['hunt-settings'] !== r0['hunt-settings']) fails.push('WC-1 a reopened window did not come back to its rect: ' + r2['hunt-settings'] + ' vs ' + r0['hunt-settings']);
        }
      }
      if (errors.length) fails.push('WC-1 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // WC-3 windows float over the World; WC-4 right-click
      const { ctx, page, errors, up } = await enter(browser, base, { width: 1440, height: 900 });
      if (!up) fails.push('WC-3 the town did not mount');
      else {
        /* The canvas rect and the camera, on EVERY animation frame across a step (Tyler 2026-10-19: windows
           float over the World; opening, closing or clicking one never moves the camera or the canvas). */
        const frames = (step) => page.evaluate(async (k) => {
          const shot = () => { const c = document.querySelector('.world-canvas').getBoundingClientRect(); const p = window.__world.screenOf(0, 0);
            return [c.left, c.top, c.width, c.height, p.x, p.y].map(Math.round).join(','); };
          const seen = new Set([shot()]);
          if (k.key) document.dispatchEvent(new KeyboardEvent('keydown', { key: k.key, bubbles: true }));
          if (k.click) { const el = document.querySelector(k.click); if (el) el.click(); }
          const t0 = performance.now();
          while (performance.now() - t0 < 500) { await new Promise((ok) => requestAnimationFrame(ok)); seen.add(shot()); }
          return Array.from(seen);
        }, step);
        const steps = [
          ['opening the docked Character window', { key: 'c' }],
          ['clicking inside it', { click: '[data-hs-win="character"] .hs-win-title' }],
          ['opening Hunts beside it', { key: 'h' }],
          ['closing Hunts', { click: '[data-hs-win="hunts"] [data-hs-close]' }],
          ['closing Character', { click: '[data-hs-win="character"] [data-hs-close]' }],
          ['opening the Configure action modal', { click: '.hb-slot[data-slot="2"]' }],
          ['closing the modal', { click: '[data-hs-win="configure-action"] [data-hs-close]' }],
        ];
        for (const [what, step] of steps) {
          const seen = await frames(step);
          if (seen.length !== 1) fails.push('WC-3 ' + what + ' moved the World (canvas rect, camera): ' + seen.join(' | '));
        }
        if (!(await page.evaluate(() => document.querySelectorAll('[data-hs-win]:not(.is-leaving)').length === 0))) fails.push('WC-3 a window stayed open after its X');
        /* WC-4: right-click the peer with the real mouse, on the figure and on the far end of the long name
           over it (beyond the figure's own box), and on bare ground (no menu, and no browser menu either). */
        await page.evaluate(() => { window.__ctxPrevented = []; window.addEventListener('contextmenu', (e) => window.__ctxPrevented.push(e.defaultPrevented)); });
        const spots = [['figure', async () => page.evaluate(([x, y]) => window.__world.screenOf(x, y), PEER_AT)],
          ['name', async () => page.evaluate((n) => { const q = window.__world.stats().names.find((x) => x.name === n); return q ? { x: q.r - 3, y: (q.t + q.b) / 2 } : null; }, PEER)]];
        for (const [where, at] of spots) {
          const p = await at();
          if (!p) { fails.push('WC-4 no ' + where + ' drawn for ' + PEER); continue; }
          await page.mouse.click(p.x, p.y, { button: 'right' });
          await page.waitForTimeout(250);
          const menu = await page.evaluate(() => { const m = document.querySelector('.hw-menu.is-on'); return m ? m.querySelector('.hw-menu-title').textContent : null; });
          if (menu !== PEER) fails.push('WC-4 a right-click on ' + PEER + '’s ' + where + ' opened ' + JSON.stringify(menu));
          await page.keyboard.press('Escape');
          await page.waitForTimeout(150);
        }
        const prevented = await page.evaluate(() => window.__ctxPrevented);
        if (!prevented.length || prevented.some((x) => !x)) fails.push('WC-4 the browser’s own menu was not suppressed on the World: ' + JSON.stringify(prevented));
      }
      if (errors.length) fails.push('WC-3 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
  } catch (e) {
    fails.push('WC-x a step failed: ' + String(e && e.message).split('\n')[0]);
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

const MUTANTS = [
  ['the dock follows the focus order', 'src/shell/window-manager.js', "else Object.assign(e, { docked: true, right: slot.has(id) ? slot.get(id) : DOCK_EDGE, width: r.width });",
    "else Object.assign(e, { docked: true, right: DOCK_EDGE + open.slice(i + 1).filter((d) => !floating.has(d)).reduce((s, d) => s + width(d) + DOCK_GAP, 0), width: r.width });"],
  ['a click that wanders a pixel drags the window off the dock', 'src/shell/shell.js', 'const DRAG_SLOP_PX = 5;', 'const DRAG_SLOP_PX = 0;'],
  ['the stage can scroll', 'src/styles/world.css', 'overflow: clip;   /* never scrollable', 'overflow: hidden;   /* never scrollable'],
  ['the pane can scroll', 'src/styles/world.css', '  overflow: clip;\n}', '  overflow: hidden;\n}'],
  ['a docked window takes its strip of the World again', 'src/shell/shell.js', '  const windowsCover = () => (phoneMq.matches ? wm.inset().right : 0);', '  const windowsCover = () => wm.inset().right;'],
  ['a name is not a target', 'src/world/render/canvas-backend.js', '      const hits = named.concat(', '      const hits = [].concat('],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'window-camera: ' + fails.length + ' rule(s) RED'
      : 'window-camera: the X closes; the dock never moves under the pointer; clicks in windows leave the World and the hero alone; windows float over the World; right-click on a player works');
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await checks(null);
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  console.log('  ✓ clean control green');
  let bad = 0;
  for (const [name, file, from, to] of MUTANTS) {
    const text = await readFile(join(ROOT, file), 'utf8');
    if (!text.includes(from)) { console.log('  ✗ ' + name + ' — anchor not found in ' + file); bad++; continue; }
    const fails = await checks({ [file]: text.replace(from, to) });
    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  console.log(bad ? 'window-camera --mutate: ' + bad + ' escaped' : 'window-camera --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

main();
