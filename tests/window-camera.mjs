#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/window-camera.mjs — WINDOWS NEVER MOVE EACH OTHER, THE WORLD OR THE HERO; RIGHT-CLICK WORKS.
//
//   node tests/window-camera.mjs           the rules, in a real Chromium
//   node tests/window-camera.mjs --mutate  every planted defect must turn a rule RED
//
// mutant-anchors: src/shell/window-manager.js src/shell/shell.js src/world/core/camera.js src/world/render/canvas-backend.js src/styles/world.css src/hunt-view/scene.js
// mutant-writes-tree: no — mutants are served overrides
//
// Tyler's playtest, 2026-10-18 (v0.2.1), on play.html with supabase-js and the
// REST paths stubbed (tests/_client-harness.mjs), the character standing in
// town (tests/fixtures/alpha-envelope.json). The hero never walks on its own
// (Tyler 2026-10-19), so the
// camera moves only for the reason a rule is about.
//   WC-1  THE X CLOSES: with Hunt prep | Services | Gathering and crafting
//         docked side by side, a real press and release on Services' X
//         closes it; the other two keep their exact rects; presses on a window's
//         head (a hand's few px of wander included) move no window; a reopen comes
//         back to its rect
//   WC-2  CLICKS IN A WINDOW NEVER MOVE THE WORLD: three presses inside a docked
//         window leave the camera and the hero where they were; the stage and the
//         pane cannot be scrolled (a focused control past the edge would scroll
//         the canvas with them)
//   WC-3  WINDOWS FLOAT OVER THE WORLD (Tyler 2026-10-19): at 1440x900 the
//         canvas size, the camera and the hero's screen spot are identical
//         before and after opening two windows, focusing one, dragging one
//         off the dock and closing both, sampled every frame through each
//   WC-5  A MODAL FLOATS: with three windows docked, Configure action opens and
//         closes over them; no window closes or moves, the camera and hero stay
//   WC-4  RIGHT-CLICK: a real right-click on another player in town (on the
//         figure or on the name over it) opens the player menu, and the
//         browser's own menu is suppressed there
//   WC-6  A DOCKED WINDOW NEVER SHOVES THE BAR (Tyler 2026-10-22: a Settings tab pushed
//         the action bar to the far left): at 1440x900, 1920x1080 and 922x423, with Settings open,
//         every tab leaves the action bar exactly where it stood with Settings open on
//         its first page; on desktop that is its home (bottom-centre) and the docked
//         window ends above it
//   WC-7  THE HUNT CAMERA IS ON THE VIEWED HERO (Tyler 2026-10-22, "this is ridiculous": the
//         viewed hero stood at the analyzer's edge, most of the World empty cave wall). At
//         2000x790, a party of four on Coppercap Warrens, two of them this account's (Wrenna,
//         seat 1, not the leader; tyler, seat 3): town -> hunt -> switch hero -> town -> hunt ->
//         switch back. In every hunt the camera follows the viewed hero's unit, which stands
//         within one tile of the middle of the World the party panel, analyzer, hunt bar and
//         action bar leave uncovered, unless that part already meets the room's edge on the
//         hero's side; and that part never shows past the room
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, UID, serve, SDK_STUB } from './_client-harness.mjs';
import { harnessFail, judge, report, exitOf, cleanControl } from './_mutant-verdict.mjs';
import WARRENS from '../src/data/world/maps/coppercap_warrens.js';

const FIXTURE = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const ANDY = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const PEER = 'Bartholomew Underhill';   // a long name: its ends lie beyond the figure's box
const PEER_AT = [13, 9];

/* A read-only hook, served (never written to the tree): the World pane's runtime on window.__world. */
const PANE = 'src/app/world-pane.js';
const paneSrc = await readFile(join(ROOT, PANE), 'utf8');
if (!paneSrc.includes('    runtime.sync();\n')) throw new Error('window-camera: the hook anchor moved');
const HOOKS = { [PANE]: paneSrc.replace('    runtime.sync();\n', '    runtime.sync();\n    window.__world = runtime;\n') };

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
    const name = r.request().url().split('?')[0].split('/').pop();
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
  /* the page load is the machine's, not a rule: a cold module graph on a slow disk took 12 s (2026-10-22) */
  await page.goto(base + '/play.html', { waitUntil: 'load', timeout: 30000 });
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

/* WC-6: the action bar's rect, then Settings' every tab; the bar must not move. */
const barRect = (page) => page.evaluate(() => { const b = document.querySelector('[data-hs-widget="action-bar"]'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left, r.top, r.width].map(Math.round).join(','); });
async function settingsTabs(page, tag, fails, home) {
  /* No window open: the bar at its home. Then Esc (with nothing open) opens Settings. */
  for (let i = 0; i < 4 && (await page.evaluate(() => !!document.querySelector('[data-hs-win]:not(.is-leaving)'))); i++) { await page.keyboard.press('Escape'); await settle(page); }
  const b0 = await barRect(page);
  if (!b0) { fails.push('WC-6 [' + tag + '] no action bar'); return; }
  await page.keyboard.press('Escape');
  if (!(await wait(page, () => document.querySelector('[data-hs-win="settings"]:not(.is-leaving) .st-tab'), null, 3000))) { fails.push('WC-6 [' + tag + '] Esc did not open Settings'); return; }
  await settle(page);
  const b1 = await barRect(page);
  if (home && b1 !== b0) fails.push('WC-6 [' + tag + '] opening Settings moved the bar: ' + b0 + ' -> ' + b1);
  const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="settings"] .st-tab:not([hidden])')).map((t) => t.getAttribute('data-cat')));
  if (tabs.length < 2) fails.push('WC-6 [' + tag + '] Settings shows ' + tabs.length + ' tab(s)');
  for (const cat of tabs) {
    const back = await page.$('[data-hs-win="settings"] .st-back');
    if (back && await back.isVisible()) { await back.click(); await page.waitForTimeout(80); }
    await page.click('[data-hs-win="settings"] .st-tab[data-cat="' + cat + '"]');
    await settle(page);
    const b = await barRect(page);
    if (b !== b1) { fails.push('WC-6 [' + tag + '] the ' + cat + ' tab moved the bar: ' + b1 + ' -> ' + b); break; }
    if (home) {
      const over = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="settings"]').getBoundingClientRect(), r = document.querySelector('[data-hs-widget="action-bar"]').getBoundingClientRect(); return w.left < r.right && r.left < w.right && w.top < r.bottom && r.top < w.bottom; });
      if (over) { fails.push('WC-6 [' + tag + '] the ' + cat + ' tab ran Settings over the bar'); break; }
    }
  }
  await page.keyboard.press('Escape');
  await settle(page);
}

/* ── WC-7: the hunt camera ──
   A party of four on Coppercap Warrens (Tyler's 2026-10-22 screenshot): slot 0 plays Wrenna (seat 1, not the
   leader), slot 1 plays tyler (seat 3). Spot A is the Tool Store at the room's east edge, B the Copper Face
   mid-room. Each slot's server answer is s.env[slot]; a pushed frame that skips a version makes it re-read. */
const PARTY = [['Brannoc', 'shield'], ['Wrenna', 'bow'], ['Fingerguns', 'staff'], ['tyler', 'wand']];
const SEAT_OF = { 0: 1, 1: 3 };
const SPOTS = { A: [[52, 10], [53, 11], [50, 12], [49, 15]], B: [[37, 8], [36, 9], [34, 8], [35, 10]] };
function huntEnvFor(slot, spot) {
  const e = clone(FIXTURE), seat = SEAT_OF[slot], at = SPOTS[spot];
  e.name = PARTY[seat][0];
  e.account = { max_concurrent: 4 };
  e.state = Object.assign({}, e.state, { active_kind: 'combat', active_id: 'coppercap_warrens' });
  e.hunt = Object.assign({}, e.hunt, { hunt_id: 'coppercap_warrens', hero: Object.assign({}, e.hunt.hero, { unit: seat + 1, name: PARTY[seat][0] }),
    pose: { at_ms: e.hunt.pose.at_ms, units: at.map(([x, y], i) => ({ u: i + 1, side: 'hero', x, y }))
      .concat([{ u: 101, side: 'monster', kind: 'goblin_skulker', x: at[0][0] + 1, y: at[0][1] - 1 }]) } });
  e.hunt_track = [];
  e.hunt_events = [];
  const m0 = e.party.members[0];
  e.party = { leader: 1, self: seat + 1, self_seat: seat, leader_seat: 0, open: true,
    members: PARTY.map(([name, weapon], i) => Object.assign({}, m0, { unit: i + 1, seat: i, name, weapon, aggro: i === 0 })) };
  return e;
}
const townEnvFor = (slot) => Object.assign(townEnv(), { name: PARTY[SEAT_OF[slot]][0], account: { max_concurrent: 4 } });

async function stubSlots(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    const slot = body.p_slot ?? body.slot ?? 0;
    const env = () => (s.env[slot] ? Object.assign(clone(s.env[slot]), { version: ++s.version }) : { ok: false, error: 'no_character' });
    if (name === 'hr_load') return json(env());
    if (name === 'hr-accrue') return json(s.env[slot] ? Object.assign({ accrued: true }, env()) : { accrued: false });
    if (name === 'hr_town_walkers') return json({ ok: true, map: body.p_map, cap: 40, walkers: [] });
    if (name === 'hr_chat_recent') return json({ ok: true, zone: 'local:town', party: null, lines: [] });
    if (name === 'hr_social_state') return json({ ok: true, friends: [], incoming: [], outgoing: [], blocks: [] });
    if (name === 'hr_whispers_recent') return json({ ok: true, lines: [] });
    return json({ ok: true });
  });
}
/* Both slots answer `spot` (a hunt spot, or 'town') from now on, and each gets it pushed: a frame on its own topic
   carrying the whole character (2026-12-25-frame-push-revive.sql), applied like a load. */
async function moveBoth(page, s, spot) {
  for (const slot of [0, 1]) s.env[slot] = spot === 'town' ? townEnvFor(slot) : huntEnvFor(slot, spot);
  for (const slot of [0, 1]) {
    const e = Object.assign(clone(s.env[slot]), { version: ++s.version });
    await page.evaluate(([topic, env]) => window.__hub.send(topic, { t: 'state', frame: env.version, env }), ['hr:' + UID + ':' + slot, e]);
  }
}
/* The World as it stands: the scene, the unit the camera follows, the viewed hero's tile on screen, the part of
   the World the four hunt panels leave uncovered (their own boxes) and the room's edges, in client px. */
const huntView = (page, tile) => page.evaluate(([tx, ty, mw, mh]) => {
  const w = window.__world, s = w.stats();
  const c = document.querySelector('#panel-world canvas').getBoundingClientRect();
  const box = (id) => { const e = document.querySelector('[data-hs-widget="' + id + '"]'); const r = e && e.getBoundingClientRect(); return r && r.width > 0 ? r : null; };
  const party = box('party'), an = box('analyzer'), top = box('hunt-topbar'), bar = box('action-bar');
  const sz = 32 * s.z / s.dpr, p = w.screenOf(tx, ty), o = w.screenOf(0, 0), e = w.screenOf(mw - 1, mh - 1);
  return { kind: s.kind, map: s.scene, unit: s.hunt && s.hunt.hero ? s.hunt.hero.unit : null, tile: sz,
    p: p && [p.x, p.y], open: [party ? party.right : c.left, top ? top.bottom : c.top, an ? an.left : c.right, bar ? bar.top : c.bottom],
    room: o && e && [o.x - sz / 2, o.y - sz / 2, e.x + sz / 2, e.y + sz / 2] };
}, [tile[0], tile[1], WARRENS.rows[0].length, WARRENS.rows.length]);
/* WC-7 on one view: `unit` is the viewed hero's, standing on `tile`. */
function centred(v, who, unit) {
  if (v.kind !== 'hunt' || v.map !== 'coppercap_warrens' || !v.p || !v.room) return ['WC-7 ' + who + ': the World is not on the Warrens hunt (' + v.kind + ' ' + v.map + ')'];
  const out = [];
  if (v.unit !== unit) out.push('WC-7 ' + who + ': the camera follows unit ' + v.unit + ', not the viewed hero (unit ' + unit + ')');
  for (const [ax, i] of [['x', 0], ['y', 1]]) {
    const lo = v.open[i], hi = v.open[i + 2], rlo = v.room[i], rhi = v.room[i + 2], off = v.p[i] - (lo + hi) / 2;
    const atEdge = off > 0 ? Math.abs(hi - rhi) <= 2 : Math.abs(lo - rlo) <= 2;
    if (Math.abs(off) > v.tile && !atEdge) out.push('WC-7 ' + who + ' stands ' + (off / v.tile).toFixed(1) + ' tiles off the middle of the uncovered World on ' + ax + ', no room edge there (uncovered ' + [lo, hi].map(Math.round) + ', room ' + [rlo, rhi].map(Math.round) + ')');
    if (rhi - rlo > hi - lo && (lo < rlo - 2 || hi > rhi + 2)) out.push('WC-7 ' + who + ': the uncovered World shows past the room on ' + ax + ' (uncovered ' + [lo, hi].map(Math.round) + ', room ' + [rlo, rhi].map(Math.round) + ')');
  }
  return out;
}

async function huntCamera(browser, base) {
  const fails = [];
  const s = { env: { 0: townEnvFor(0), 1: townEnvFor(1) }, version: 1 };
  const ctx = await browser.newContext({ viewport: { width: 2000, height: 790 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  try {
    await stubSlots(page, s);
    await page.goto(base + '/play.html', { waitUntil: 'load', timeout: 30000 });
    await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
    await page.fill('input[name=email]', 'qa@example.test');
    await page.fill('input[name=password]', 'not-a-real-password');
    await page.click('.auth-submit');
    /* A press that shows slot n mounts a new pane; its runtime is the one the hook names (the old one is forgotten first). */
    const show = async (sel, n) => {
      await page.evaluate(() => { window.__world = null; });
      await page.click(sel);
      return wait(page, (k) => document.querySelector('#panel-world[data-slot="' + k + '"]') && window.__world && window.__world.stats().frames > 0 && document.querySelector('.hs-launchers'), n);
    };
    await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
    await show('[data-app="play"][data-slot="0"]', 0);
    await page.click('[data-app="characters"]');
    await wait(page, () => document.querySelector('[data-app="play"][data-slot="1"]'));
    await show('[data-app="play"][data-slot="1"]', 1);
    if (!(await show('.char-tab[data-slot="0"]', 0)) || !(await wait(page, () => window.__world.stats().kind === 'town'))) { fails.push('WC-7 Wrenna\'s town did not mount'); return fails; }
    /* A hunt view settles when the scene is the Warrens with a hero and the hunt panels are up (then the camera's ease). */
    const inHunt = async () => {
      const ok = await wait(page, () => { const t = window.__world.stats(); return t.kind === 'hunt' && t.scene === 'coppercap_warrens' && t.hunt && t.hunt.hero
        && document.querySelector('[data-hs-widget="analyzer"]') && document.querySelector('[data-hs-widget="party"]'); });
      await page.waitForTimeout(450);
      return ok;
    };
    const steps = [
      ['Wrenna, the hunt starting on screen (spot A, the east edge)', 'A', null, 0],
      ['tyler, switched to mid-hunt (spot A)', null, 1, 1],
      ['tyler, back in town', 'town', null, 1],
      ['tyler, the next hunt (spot B, mid-room)', 'B', null, 1],
      ['Wrenna, switched back mid-hunt (spot B)', null, 0, 0],
    ];
    let spot = null;
    for (const [who, move, to, slot] of steps) {
      if (move) { spot = move; await moveBoth(page, s, move); }
      if (to !== null && !(await show('.char-tab[data-slot="' + to + '"]', to))) { fails.push('WC-7 ' + who + ': the switch did not show slot ' + to); break; }
      if (spot === 'town') {
        if (!(await wait(page, () => window.__world.stats().kind === 'town' && window.__world.stats().walk))) fails.push('WC-7 ' + who + ': the town did not come back');
        continue;
      }
      if (!(await inHunt())) { fails.push('WC-7 ' + who + ': the Warrens hunt did not mount'); continue; }
      const seat = SEAT_OF[slot];
      fails.push(...centred(await huntView(page, SPOTS[spot][seat]), who, seat + 1));
    }
  } finally {
    if (errors.length) fails.push('WC-7 console errors: ' + errors.slice(0, 3).join(' | '));
    await ctx.close();
  }
  return fails;
}

async function checks(overrides) {
  const fails = [];
  const { server, port } = await serve(Object.assign({}, HOOKS, overrides || {}));
  const base = 'http://127.0.0.1:' + port;
  const browser = await leaseBrowser(chromium);
  try {
    { // WC-1, WC-2 on a wide screen (three windows dock side by side inside 60% of the World)
      const { ctx, page, errors, up } = await enter(browser, base, { width: 2560, height: 1200 });
      if (!up) fails.push('WC-1 the town did not mount');
      else {
        for (const k of ['p', 'r', 'g']) { await page.keyboard.press(k); await settle(page); }
        const r0 = await rects(page);
        if (Object.keys(r0).sort().join() !== 'hunt-prep,shop,skills-trade') fails.push('WC-1 three docked windows did not open: ' + JSON.stringify(r0));
        else {
          const c0 = await camera(page), h0 = await hero(page);
          /* WC-2: presses inside a window (its head, its body) move no window, no camera, no hero. */
          for (const sel of ['[data-hs-win="shop"] .hs-win-title', '[data-hs-win="hunt-prep"] .hs-win-title', '[data-hs-win="shop"] .hs-win-title']) { await press(page, sel, 3); await page.waitForTimeout(120); }
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
          await press(page, '[data-hs-win="shop"] [data-hs-close]');
          await settle(page);
          const r1 = await rects(page);
          if (r1['shop']) fails.push('WC-1 a press on the Shop’s X did not close it: ' + JSON.stringify(r1));
          if (r1['hunt-prep'] !== r0['hunt-prep'] || r1['skills-trade'] !== r0['skills-trade']) fails.push('WC-1 closing one window moved the others: ' + JSON.stringify(r1) + ' vs ' + JSON.stringify(r0));
          await page.keyboard.press('r'); await settle(page);
          const r2 = await rects(page);
          if (r2['shop'] !== r0['shop']) fails.push('WC-1 a reopened window did not come back to its rect: ' + r2['shop'] + ' vs ' + r0['shop']);
          /* WC-5 (Tyler, v0.2.6): the centred Configure action modal floats over the World: with three
             windows docked, opening it and closing it close no window and leave the camera and hero alone. */
          const mc0 = await camera(page), mh0 = await hero(page);
          await press(page, '.hb-slot[data-slot="2"]');
          if (!(await wait(page, () => document.querySelector('[data-hs-win="configure-action"]:not(.is-leaving)'), null, 3000))) fails.push('WC-5 a bar slot did not open Configure action');
          else {
            await settle(page);
            const mr1 = await rects(page), mc1 = await camera(page), mh1 = await hero(page);
            await press(page, '[data-hs-win="configure-action"] [data-hs-close]');
            await settle(page);
            const mr2 = await rects(page), mc2 = await camera(page), mh2 = await hero(page);
            if (mr2['configure-action']) fails.push('WC-5 the modal’s X did not close it');
            for (const id of ['hunt-prep', 'shop', 'skills-trade']) {
              if (mr1[id] !== r2[id] || mr2[id] !== r2[id]) fails.push('WC-5 the modal closed or moved ' + id + ': ' + [r2[id], mr1[id], mr2[id]].join(' -> '));
            }
            if (mc1 !== mc0 || mc2 !== mc0) fails.push('WC-5 the modal moved the camera: ' + [mc0, mc1, mc2].join(' -> '));
            if (mh1 !== mh0 || mh2 !== mh0) fails.push('WC-5 the modal moved the hero: ' + [mh0, mh1, mh2].join(' -> '));
          }
        }
      }
      if (errors.length) fails.push('WC-1 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // WC-3 no snap; WC-4 right-click
      const { ctx, page, errors, up } = await enter(browser, base, { width: 1440, height: 900 });
      if (!up) fails.push('WC-3 the town did not mount');
      else {
        /* The World as the player sees it: the canvas box, the map corner and the hero on screen. */
        const view = () => page.evaluate(() => {
          const c = document.querySelector('#panel-world canvas').getBoundingClientRect();
          const w = window.__world, h = w.stats().walk.cell, o = w.screenOf(0, 0), p = w.screenOf(h[0], h[1]);
          return [c.left, c.top, c.width, c.height, o.x, o.y, p.x, p.y].map(Math.round).join(',');
        });
        /* Every animation frame for 500 ms after a step: a frame that differs is a moved World. */
        const frames = () => page.evaluate(async () => {
          const out = new Set(), t0 = performance.now();
          while (performance.now() - t0 < 500) {
            await new Promise((ok) => requestAnimationFrame(ok));
            const c = document.querySelector('#panel-world canvas').getBoundingClientRect();
            const w = window.__world, h = w.stats().walk.cell, o = w.screenOf(0, 0), p = w.screenOf(h[0], h[1]);
            out.add([c.left, c.top, c.width, c.height, o.x, o.y, p.x, p.y].map(Math.round).join(','));
          }
          return Array.from(out);
        });
        const v0 = await view();
        const vb = await page.evaluate(() => [innerWidth, innerHeight]);
        const [cl, , cw, , , , hx] = v0.split(',').map(Number);
        if (cw < vb[0] - 40) fails.push('WC-3 the World canvas does not span the screen: ' + v0 + ' in ' + vb);
        if (Math.abs(hx - (cl + cw / 2)) > 48) fails.push('WC-3 the hero is not centred across the World: x ' + hx + ' in ' + v0);
        const steps = [
          ['opening Gathering and crafting', async () => page.keyboard.press('g')],
          ['opening Hunt prep', async () => page.keyboard.press('p')],
          ['focusing Gathering and crafting', async () => press(page, '[data-hs-win="skills-trade"] .hs-win-title')],
          ['dragging Hunt prep', async () => {
            const b = await page.locator('[data-hs-win="hunt-prep"] .hs-win-title').boundingBox();
            await page.mouse.move(b.x + 10, b.y + b.height / 2); await page.mouse.down();
            await page.mouse.move(b.x - 200, b.y + 120, { steps: 6 }); await page.mouse.up();
          }],
          ['closing Hunt prep', async () => press(page, '[data-hs-win="hunt-prep"] [data-hs-close]')],
          ['closing Gathering and crafting', async () => press(page, '[data-hs-win="skills-trade"] [data-hs-close]')],
        ];
        for (const [what, act] of steps) {
          let seen;
          try { seen = await Promise.all([frames(), act()]).then((r) => r[0]); } catch (e) { fails.push('WC-3 ' + what + ' could not be done: ' + String(e && e.message).split('\n')[0]); break; }
          await settle(page);
          const moved = seen.concat([await view()]).filter((x) => x !== v0);
          if (moved.length) { fails.push('WC-3 ' + what + ' moved the World: ' + v0 + ' -> ' + moved[0]); break; }
        }
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
        await settingsTabs(page, '1440x900', fails, true);
      }
      if (errors.length) fails.push('WC-3 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    /* WC-6 at 1920x1080 (the bar had room left of the dock there, so it jumped across), and on a phone, where the
       sheet is full height and the bar clears it the same on every tab */
    for (const [vp, home] of [[{ width: 1920, height: 1080 }, true], [{ width: 922, height: 423 }, false]]) {
      const tag = vp.width + 'x' + vp.height;
      const { ctx, page, errors, up } = await enter(browser, base, vp);
      if (!up) fails.push('WC-6 [' + tag + '] the town did not mount');
      else await settingsTabs(page, tag, fails, home);
      if (errors.length) fails.push('WC-6 [' + tag + '] console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    fails.push(...(await huntCamera(browser, base)));   // WC-7
  } catch (e) {
    /* a step that threw is HARNESS, never a rule (2026-10-22, tests/_mutant-verdict.mjs) */
    fails.push(harnessFail('a page step', e));
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

const MUTANTS = [
  ['the dock follows the focus order', 'src/shell/window-manager.js', "else Object.assign(e, { docked: true, right: slot.has(id) ? slot.get(id) : DOCK_EDGE,",
    "else Object.assign(e, { docked: true, right: DOCK_EDGE + open.slice(i + 1).filter((d) => !floating.has(d)).reduce((s, d) => s + width(d) + DOCK_GAP, 0),"],
  ['a docked window that grows runs over the bar', 'src/shell/shell.js', '    capDock();\n', ''],
  ['a click that wanders a pixel drags the window off the dock', 'src/shell/shell.js', 'const DRAG_SLOP_PX = 5;', 'const DRAG_SLOP_PX = 0;'],
  ['the stage can scroll', 'src/styles/world.css', 'overflow: clip;   /* never scrollable', 'overflow: hidden;   /* never scrollable'],
  ['the pane can scroll', 'src/styles/world.css', '  overflow: clip;\n}', '  overflow: hidden;\n}'],
  ['a docked window takes the World again', 'src/shell/shell.js', '    const inset = insetNow();', '    const inset = Object.assign(insetNow(), { right: wm.openIds().length ? 420 : 0 });'],
  ['the canvas shrinks beside the windows', 'src/shell/shell.js', '  function onWm() {\n', '  function onWm() {\n    doc.querySelector(\'#panel-world canvas\').style.width = wm.openIds().length ? \'60%\' : \'\';\n'],
  ['a modal evicts the oldest docked window', 'src/shell/window-manager.js', '    if (!isModal(id)) while (sheets().length >= MAX_OPEN) drop(sheets()[0]);', '    while (open.length >= MAX_OPEN) drop(open[0]);'],
  ['a name is not a target', 'src/world/render/canvas-backend.js', '      const hits = named.concat(', '      const hits = [].concat('],
  ['the hunt camera holds the whole view on the room again: the hero hugs the analyzer (WC-7)', 'src/world/core/camera.js', "const rule = { wholeView: map.kind !== 'hunt' };", 'const rule = { wholeView: true };'],
  ['a pane mounted mid-hunt never hears the HUD inset (WC-7)', 'src/shell/shell.js', 'insetListeners.add(fn); fn(insetNow());', 'insetListeners.add(fn);'],
  ['the hunt camera follows the party leader, not the viewed hero (WC-7)', 'src/hunt-view/scene.js', 'viewed: h && h.hero.unit !== null ? h.hero.unit :', 'viewed: p && p.leader !== null ? p.leader :'],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'window-camera: ' + fails.length + ' rule(s) RED'
      : 'window-camera: the X closes; the dock never moves under the pointer; clicks in windows leave the World and the hero alone; windows float over the World; right-click on a player works; the hunt camera is on the viewed hero');
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await cleanControl(() => checks(null));
  console.log(clean.line);
  if (clean.code) process.exit(clean.code);
  const counts = { caught: 0, harness: 0, escaped: 0 };
  for (const [name, file, from, to] of MUTANTS) {
    const text = await readFile(join(ROOT, file), 'utf8');
    if (!text.includes(from)) { console.log('  ✗ ' + name + ' — HARNESS: anchor not found in ' + file); counts.harness++; continue; }
    console.log(report(name, await judge(() => checks({ [file]: text.replace(from, to) })), counts));
  }
  console.log(exitOf(counts) ? 'window-camera --mutate: ' + counts.escaped + ' escaped, ' + counts.harness + ' HARNESS (not catches)' : 'window-camera --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught, each by a named rule');
  process.exit(exitOf(counts));
}

main();
